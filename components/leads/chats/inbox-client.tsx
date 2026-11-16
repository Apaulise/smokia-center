"use client";

import { MessageSquare } from "lucide-react";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";

import { AudioRecorderDialog } from "@/components/leads/chats/audio-recorder";
import { ChatThread, type ThreadState } from "@/components/leads/chats/chat-thread";
import { ContactPanel, type AutomationSummary } from "@/components/leads/chats/contact-panel";
import { ConversationList } from "@/components/leads/chats/conversation-list";
import type { ComposerQuickReplies } from "@/components/leads/chats/message-composer";
import { useInboxRealtime } from "@/components/leads/chats/use-inbox-realtime";
import { loadConversation, loadConversationList, loadOlderMessages, markConversationRead, pollInboxNow, sendChatAudio, sendChatText, setConversationArchived } from "@/lib/chats/actions";
import type { TagLabelRow } from "@/lib/chats/db";
import { previewOf } from "@/lib/chats/format";
import { applyConversationChange, filterCounts, filterItems, sortItems, tagsInUse, upsertThreadMessage, type ThreadMessage } from "@/lib/chats/inbox";
import { createTextQuickReply, markQuickReplyUsed } from "@/lib/chats/inbox-actions";
import type { ChatMessageView, ConversationDetail, ConversationFilter, ConversationListItem, ConversationScope, InboxList } from "@/lib/chats/queries";
import type { QuickReplyView } from "@/lib/chats/quick-replies";
import { labelMap } from "@/lib/chats/tag-view";
import { replyWindow } from "@/lib/chats/window";
import { cn } from "@/lib/utils";

const FILTER_VALUES: ConversationFilter[] = ["todas", "sin_leer", "por_responder", "ventana", "seguimiento", "archivadas"];
const PANEL_KEY = "smokia.chats.panel";
const MESSAGE_KEYS: Array<keyof ChatMessageView> = ["id", "direction", "origin", "sent_by", "body", "attachments", "delivery_status", "standby", "edited", "deleted", "occurred_at"];

type UrlState = { c: string | null; f: ConversationFilter; q: string; t: string | null };

function readUrl(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const f = params.get("f") as ConversationFilter | null;
  return {
    c: params.get("c"),
    f: f && FILTER_VALUES.includes(f) ? f : "todas",
    q: params.get("q") ?? "",
    t: params.get("t"),
  };
}

function urlFor(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.c) params.set("c", state.c);
  if (state.f !== "todas") params.set("f", state.f);
  if (state.q) params.set("q", state.q);
  if (state.t) params.set("t", state.t);
  const query = params.toString();
  return query ? `/leads/chats?${query}` : "/leads/chats";
}

function toMessage(row: Record<string, unknown>): ThreadMessage | null {
  if (typeof row.id !== "string" || typeof row.occurred_at !== "string") return null;
  const message: Record<string, unknown> = {};
  for (const key of MESSAGE_KEYS) message[key] = row[key] ?? null;
  message.standby = row.standby === true;
  message.edited = row.edited === true;
  message.deleted = row.deleted === true;
  message.attachments = row.attachments ?? [];
  return message as unknown as ThreadMessage;
}

/** Junta lo que vino del servidor con lo que había: conserva lo cargado con "Ver anteriores" y los optimistas. */
function mergeThread(previous: ThreadState | undefined, detail: ConversationDetail): ThreadState {
  let messages = detail.messages as ThreadMessage[];
  let hasOlder = detail.hasOlder;
  if (previous) {
    const ids = new Set(messages.map((message) => message.id));
    const oldestFresh = messages[0] ? Date.parse(messages[0].occurred_at) : Number.POSITIVE_INFINITY;
    const older = previous.messages.filter((message) => !message.local && !ids.has(message.id) && Date.parse(message.occurred_at) < oldestFresh);
    if (older.length > 0) {
      messages = [...older, ...messages];
      hasOlder = previous.hasOlder;
    }
    for (const local of previous.messages.filter((message) => message.local)) messages = upsertThreadMessage(messages, local);
  }
  return { detail, messages, hasOlder };
}

/**
 * La bandeja de chats como isla de cliente (§1.26). Todo lo que hace que se
 * sienta lenta lo resuelve acá sin volver a pedir la pantalla:
 *  · elegir un chat cambia el estado y la URL (`pushState`), no navega;
 *  · los hilos quedan en memoria y se precargan al pasar el mouse;
 *  · enviar, archivar, marcar leído, etiquetar y agendar son optimistas;
 *  · Realtime parcha la fila o el mensaje que cambió.
 * El servidor sigue siendo la fuente de verdad: cada hilo se revalida al
 * abrirlo y la lista se vuelve a pedir al reconectarse o cada 45 s.
 */
export function InboxClient({
  initial,
  initialDetail,
  initialFilter,
  initialSearch,
  initialTag,
  initialSelectedId,
  labels: labelRows,
  automations,
  quickReplies: initialQuickReplies,
  currentUserId,
}: {
  initial: InboxList;
  initialDetail: ConversationDetail | null;
  initialFilter: ConversationFilter;
  initialSearch: string;
  initialTag: string | null;
  initialSelectedId: string | null;
  labels: TagLabelRow[];
  automations: AutomationSummary[];
  quickReplies: { ready: boolean; items: QuickReplyView[] };
  currentUserId: string;
}) {
  const [activeItems, setActiveItems] = useState<ConversationListItem[]>(() => (initialFilter === "archivadas" ? [] : initial.items));
  const [archivedItems, setArchivedItems] = useState<ConversationListItem[] | null>(() => (initialFilter === "archivadas" ? initial.items : null));
  const [capped, setCapped] = useState(initial.capped);
  const [extrasReady, setExtrasReady] = useState(initial.extrasReady);
  const [filter, setFilter] = useState<ConversationFilter>(initialFilter);
  const [search, setSearch] = useState(initialSearch);
  const deferredSearch = useDeferredValue(search);
  const [serverResults, setServerResults] = useState<ConversationListItem[] | null>(null);
  const [tag, setTag] = useState<string | null>(initialTag);
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [threads, setThreads] = useState<Record<string, ThreadState>>(() => (initialDetail ? { [initialDetail.conversation.id]: mergeThread(undefined, initialDetail) } : {}));
  const [missing, setMissing] = useState<Set<string>>(() => new Set(initialSelectedId && !initialDetail ? [initialSelectedId] : []));
  const [panelOpen, setPanelOpen] = useState(true);
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies.items);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [listLoading, startListLoading] = useTransition();

  const inflight = useRef(new Map<string, Promise<void>>());
  const searchRef = useRef<HTMLInputElement>(null);
  const labels = useMemo(() => labelMap(labelRows), [labelRows]);
  const automationById = useMemo(() => new Map(automations.map((automation) => [automation.id, automation])), [automations]);

  const scope: ConversationScope = filter === "archivadas" ? "archivadas" : "activas";
  const scopeItems = useMemo(() => (scope === "archivadas" ? (archivedItems ?? []) : activeItems), [scope, archivedItems, activeItems]);

  // La hora avanza sola: "quedan 3 h" y "Te toca" no se quedan congelados.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // El panel recuerda si lo cerraste (sólo una comodidad de este navegador).
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (window.localStorage.getItem(PANEL_KEY) === "cerrado") setPanelOpen(false);
    } catch {
      // Sin storage: queda abierto.
    }
  }, []);

  function togglePanel() {
    setPanelOpen((open) => {
      try {
        window.localStorage.setItem(PANEL_KEY, open ? "cerrado" : "abierto");
      } catch {
        // Sin storage no se recuerda; no pasa nada.
      }
      return !open;
    });
  }

  // ── Lista ──────────────────────────────────────────────────────────────────

  const updateItems = useCallback((targetScope: ConversationScope, update: (items: ConversationListItem[]) => ConversationListItem[]) => {
    if (targetScope === "archivadas") setArchivedItems((items) => (items ? update(items) : items));
    else setActiveItems(update);
  }, []);

  /** Cambia una conversación en las dos listas y en su hilo, si está en memoria. */
  const patchConversation = useCallback((id: string, patch: Partial<ConversationListItem>) => {
    const apply = (items: ConversationListItem[]) => items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setActiveItems(apply);
    setArchivedItems((items) => (items ? apply(items) : items));
    setServerResults((items) => (items ? apply(items) : items));
    setThreads((current) => {
      const thread = current[id];
      if (!thread) return current;
      const conversation = { ...thread.detail.conversation, ...patch };
      return { ...current, [id]: { ...thread, detail: { ...thread.detail, conversation, window: replyWindow(conversation.last_inbound_at) } } };
    });
  }, []);

  const reloadList = useCallback(
    (targetScope: ConversationScope = scope) => {
      startListLoading(async () => {
        const result = await loadConversationList(targetScope);
        setExtrasReady(result.extrasReady);
        if (targetScope === "archivadas") setArchivedItems(result.items);
        else {
          setActiveItems(result.items);
          setCapped(result.capped);
        }
      });
    },
    [scope],
  );

  // ── Hilos ──────────────────────────────────────────────────────────────────

  const fetchThread = useCallback((id: string) => {
    const running = inflight.current.get(id);
    if (running) return running;
    const task = loadConversation(id)
      .then((detail) => {
        if (!detail) {
          setMissing((current) => new Set(current).add(id));
          return;
        }
        setThreads((current) => ({ ...current, [id]: mergeThread(current[id], detail) }));
        // La fila de la lista se pone al día con la del hilo (es más fresca).
        const fresh = detail.conversation;
        const apply = (items: ConversationListItem[]) => items.map((item) => (item.id === id ? { ...item, ...fresh, lead_name: fresh.lead_name ?? item.lead_name, lead_status: fresh.lead_status ?? item.lead_status } : item));
        setActiveItems(apply);
        setArchivedItems((items) => (items ? apply(items) : items));
      })
      .catch(() => {
        // Sin red: queda lo que había en memoria. El próximo intento lo vuelve a pedir.
      })
      .finally(() => {
        inflight.current.delete(id);
      });
    inflight.current.set(id, task);
    return task;
  }, []);

  const prefetch = useCallback(
    (id: string) => {
      if (!threads[id] && !inflight.current.has(id)) void fetchThread(id);
    },
    [threads, fetchThread],
  );

  const markRead = useCallback(
    (id: string) => {
      const item = activeItems.find((entry) => entry.id === id) ?? archivedItems?.find((entry) => entry.id === id);
      if (!item || item.unread_count <= 0) return;
      patchConversation(id, { unread_count: 0 });
      void markConversationRead(id);
    },
    [activeItems, archivedItems, patchConversation],
  );

  const select = useCallback(
    (id: string | null, mode: "push" | "replace" | "none" = "push") => {
      setSelectedId(id);
      if (mode !== "none") {
        const url = urlFor({ c: id, f: filter, q: search, t: tag });
        if (mode === "push") window.history.pushState(null, "", url);
        else window.history.replaceState(null, "", url);
      }
      if (!id) return;
      markRead(id);
      // Lo que hay en memoria se ve en el acto; igual se revalida por detrás.
      void fetchThread(id);
    },
    [filter, search, tag, markRead, fetchThread],
  );

  // Precarga las primeras conversaciones cuando el navegador está libre.
  useEffect(() => {
    const ids = activeItems.slice(0, 3).map((item) => item.id);
    const idle = window.requestIdleCallback ?? ((callback: () => void) => window.setTimeout(callback, 400));
    const handle = idle(() => ids.forEach((id) => prefetch(id)));
    return () => {
      if (window.cancelIdleCallback && typeof handle === "number") window.cancelIdleCallback(handle);
    };
    // Sólo al montar: después precarga el hover.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Atrás / adelante del navegador.
  useEffect(() => {
    function onPopState() {
      const state = readUrl();
      setFilter(state.f);
      setSearch(state.q);
      setTag(state.t);
      setSelectedId(state.c);
      if (state.c) void fetchThread(state.c);
      if (state.f === "archivadas") reloadList("archivadas");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [fetchThread, reloadList]);

  // ── Filtros y búsqueda ─────────────────────────────────────────────────────

  function changeFilter(next: ConversationFilter) {
    setFilter(next);
    window.history.replaceState(null, "", urlFor({ c: selectedId, f: next, q: search, t: tag }));
    if (next === "archivadas" && archivedItems === null) reloadList("archivadas");
  }

  function changeTag(next: string | null) {
    setTag(next);
    window.history.replaceState(null, "", urlFor({ c: selectedId, f: filter, q: search, t: next }));
  }

  function changeSearch(value: string) {
    setSearch(value.slice(0, 60));
  }

  // La URL de la búsqueda se escribe cuando se deja de tipear (replaceState no ensucia el historial).
  useEffect(() => {
    const timer = setTimeout(() => window.history.replaceState(null, "", urlFor({ c: selectedId, f: filter, q: deferredSearch, t: tag })), 300);
    return () => clearTimeout(timer);
  }, [deferredSearch, selectedId, filter, tag]);

  // Si la bandeja tiene más de lo que se cargó, la búsqueda también se le pide al servidor.
  useEffect(() => {
    const term = deferredSearch.trim();
    if (!capped || term.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServerResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadConversationList(scope, term).then((result) => {
        if (!cancelled) setServerResults(result.items);
      });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [deferredSearch, capped, scope]);

  const visible = useMemo(() => {
    const source = serverResults ?? scopeItems;
    return filterItems(source, { filter, search: serverResults ? "" : deferredSearch, tag }, now);
  }, [serverResults, scopeItems, filter, deferredSearch, tag, now]);

  const counts = useMemo(() => filterCounts(activeItems, now), [activeItems, now]);
  const tags = useMemo(() => tagsInUse(scopeItems), [scopeItems]);

  // ── Realtime ───────────────────────────────────────────────────────────────

  const resyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Antes de releer lo que ya tenemos en la base, le pide a Zernio lo nuevo
   * (`pollInboxNow`). Es lo que mantiene la bandeja al día sin que nadie
   * toque "Sincronizar": en development es la única vía (Zernio no llega a
   * localhost), y en producción es la red de seguridad del webhook.
   */
  const scheduleResync = useCallback(() => {
    if (resyncTimer.current) clearTimeout(resyncTimer.current);
    resyncTimer.current = setTimeout(() => {
      void pollInboxNow().finally(() => {
        reloadList("activas");
        if (archivedItems !== null) reloadList("archivadas");
        if (selectedId) void fetchThread(selectedId);
      });
    }, 400);
  }, [reloadList, archivedItems, selectedId, fetchThread]);

  // Al abrir la pantalla, una sincronización inmediata: no hay que esperar el primer sondeo.
  useEffect(() => {
    scheduleResync();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useInboxRealtime({
    onConversation(row) {
      const id = typeof row.id === "string" ? row.id : null;
      if (!id) return;
      let unknown = false;
      setActiveItems((items) => {
        const next = applyConversationChange(items, row, "activas");
        if (next === null) {
          unknown = true;
          return items;
        }
        return next;
      });
      setArchivedItems((items) => (items ? (applyConversationChange(items, row, "archivadas") ?? items) : items));
      if (unknown) scheduleResync();
      setThreads((current) => {
        const thread = current[id];
        if (!thread) return current;
        const conversation = { ...thread.detail.conversation };
        for (const key of Object.keys(conversation) as Array<keyof ConversationListItem>) {
          if (key in row && key !== "lead_name" && key !== "lead_status") (conversation as Record<string, unknown>)[key] = row[key];
        }
        return { ...current, [id]: { ...thread, detail: { ...thread.detail, conversation, window: replyWindow(conversation.last_inbound_at) } } };
      });
      // Llegó algo al chat que estás mirando: se marca leído (sólo en SmokIA).
      if (id === selectedId && typeof row.unread_count === "number" && row.unread_count > 0 && document.visibilityState === "visible") {
        patchConversation(id, { unread_count: 0 });
        void markConversationRead(id);
      }
    },
    onMessage(row) {
      const conversationId = typeof row.conversation_id === "string" ? row.conversation_id : null;
      const message = toMessage(row);
      if (!conversationId || !message) return;
      setThreads((current) => {
        const thread = current[conversationId];
        if (!thread) return current;
        return { ...current, [conversationId]: { ...thread, messages: upsertThreadMessage(thread.messages, message) } };
      });
    },
    onResync: scheduleResync,
  });

  // ── Acciones del hilo ──────────────────────────────────────────────────────

  function pushLocal(conversationId: string, message: ThreadMessage) {
    setThreads((current) => {
      const thread = current[conversationId];
      if (!thread) return current;
      return { ...current, [conversationId]: { ...thread, messages: upsertThreadMessage(thread.messages, message) } };
    });
  }

  function settleLocal(conversationId: string, localId: string, result: { ok: boolean; message: string; sent?: ChatMessageView }) {
    setThreads((current) => {
      const thread = current[conversationId];
      if (!thread) return current;
      let messages = thread.messages;
      if (result.ok) {
        messages = messages.filter((message) => message.id !== localId);
        if (result.sent) messages = upsertThreadMessage(messages, result.sent as ThreadMessage);
        else messages = thread.messages.map((message) => (message.id === localId ? { ...message, local: undefined } : message));
      } else {
        messages = messages.map((message) => (message.id === localId ? { ...message, local: "failed" as const, error: result.message } : message));
      }
      return { ...current, [conversationId]: { ...thread, messages } };
    });
  }

  function bumpPreview(conversationId: string, body: string | null, attachments: ChatMessageView["attachments"]) {
    const at = new Date().toISOString();
    const apply = (items: ConversationListItem[]) => sortItems(items.map((item) => (item.id === conversationId ? { ...item, last_message_at: at, last_message_preview: previewOf(body, attachments), unread_count: 0 } : item)));
    setActiveItems(apply);
  }

  function optimistic(conversationId: string, clientId: string, body: string | null, attachments: ChatMessageView["attachments"]): ThreadMessage {
    return {
      id: `local-${clientId}`,
      direction: "OUT",
      origin: "CRM",
      sent_by: currentUserId,
      body,
      attachments,
      delivery_status: null,
      standby: false,
      edited: false,
      deleted: false,
      occurred_at: new Date().toISOString(),
      local: "sending",
      clientId,
    };
  }

  function sendText(conversationId: string, text: string, clientId = crypto.randomUUID()) {
    const local = optimistic(conversationId, clientId, text, []);
    pushLocal(conversationId, local);
    bumpPreview(conversationId, text, []);
    void sendChatText({ conversationId, text, clientId }).then(
      (result) => settleLocal(conversationId, local.id, result),
      () => settleLocal(conversationId, local.id, { ok: false, message: "Se cortó la conexión. Reintentá." }),
    );
  }

  function sendAudio(conversationId: string, reply: QuickReplyView, clientId = crypto.randomUUID()) {
    const attachments = [{ type: "audio" }];
    const local = { ...optimistic(conversationId, clientId, null, attachments), quickReplyId: reply.id } as ThreadMessage & { quickReplyId: string };
    pushLocal(conversationId, local);
    bumpPreview(conversationId, null, attachments);
    void sendChatAudio({ conversationId, quickReplyId: reply.id, clientId }).then(
      (result) => settleLocal(conversationId, local.id, result),
      () => settleLocal(conversationId, local.id, { ok: false, message: "Se cortó la conexión. Reintentá." }),
    );
  }

  function retry(conversationId: string, message: ThreadMessage) {
    if (!message.clientId) return;
    setThreads((current) => {
      const thread = current[conversationId];
      if (!thread) return current;
      return { ...current, [conversationId]: { ...thread, messages: thread.messages.filter((entry) => entry.id !== message.id) } };
    });
    const quickReplyId = (message as ThreadMessage & { quickReplyId?: string }).quickReplyId;
    const reply = quickReplyId ? quickReplies.find((entry) => entry.id === quickReplyId) : undefined;
    if (reply) sendAudio(conversationId, reply, message.clientId);
    else if (message.body) sendText(conversationId, message.body, message.clientId);
  }

  function loadOlder(conversationId: string) {
    const thread = threads[conversationId];
    const oldest = thread?.messages.find((message) => !message.local);
    if (!thread || !oldest || thread.loadingOlder) return;
    setThreads((current) => ({ ...current, [conversationId]: { ...current[conversationId], loadingOlder: true } }));
    void loadOlderMessages(conversationId, oldest.occurred_at).then((result) => {
      setThreads((current) => {
        const existing = current[conversationId];
        if (!existing) return current;
        const ids = new Set(existing.messages.map((message) => message.id));
        const older = (result.messages as ThreadMessage[]).filter((message) => !ids.has(message.id));
        return { ...current, [conversationId]: { ...existing, messages: [...older, ...existing.messages], hasOlder: result.hasOlder, loadingOlder: false } };
      });
    });
  }

  const archive = useCallback(
    (conversationId: string) => {
      const thread = threads[conversationId];
      const item = activeItems.find((entry) => entry.id === conversationId) ?? archivedItems?.find((entry) => entry.id === conversationId) ?? thread?.detail.conversation;
      if (!item) return;
      const toArchived = item.status !== "ARCHIVADA";
      const status = toArchived ? "ARCHIVADA" : "ACTIVA";

      // El siguiente de la lista, para seguir trabajando sin volver a elegir.
      const index = visible.findIndex((entry) => entry.id === conversationId);
      const next = visible[index + 1] ?? visible[index - 1] ?? null;

      updateItems(toArchived ? "activas" : "archivadas", (items) => items.filter((entry) => entry.id !== conversationId));
      updateItems(toArchived ? "archivadas" : "activas", (items) => sortItems([{ ...item, status }, ...items.filter((entry) => entry.id !== conversationId)]));
      patchConversation(conversationId, { status });
      if (selectedId === conversationId && ((toArchived && scope === "activas") || (!toArchived && scope === "archivadas"))) select(next?.id ?? null, "replace");

      void setConversationArchived(conversationId, toArchived).then((result) => {
        if (result.ok) return;
        // No se pudo: vuelve a donde estaba.
        updateItems(toArchived ? "archivadas" : "activas", (items) => items.filter((entry) => entry.id !== conversationId));
        updateItems(toArchived ? "activas" : "archivadas", (items) => sortItems([item, ...items]));
        patchConversation(conversationId, { status: item.status });
      });
    },
    [threads, activeItems, archivedItems, visible, updateItems, patchConversation, selectedId, scope, select],
  );

  // ── Teclado ────────────────────────────────────────────────────────────────

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      if (document.querySelector("[role=dialog]")) return;

      const index = visible.findIndex((item) => item.id === selectedId);
      switch (event.key) {
        case "j":
        case "ArrowDown": {
          const next = visible[Math.min(visible.length - 1, index + 1)] ?? visible[0];
          if (next) {
            event.preventDefault();
            select(next.id, "replace");
            document.querySelector(`[data-conversation-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "k":
        case "ArrowUp": {
          const previous = visible[Math.max(0, index - 1)];
          if (previous) {
            event.preventDefault();
            select(previous.id, "replace");
            document.querySelector(`[data-conversation-id="${previous.id}"]`)?.scrollIntoView({ block: "nearest" });
          }
          break;
        }
        case "/":
          event.preventDefault();
          searchRef.current?.focus();
          break;
        case "e":
          if (selectedId) {
            event.preventDefault();
            archive(selectedId);
          }
          break;
        case "r":
          if (selectedId) {
            event.preventDefault();
            document.getElementById("chat-composer-input")?.focus();
          }
          break;
        case "Escape":
          if (selectedId && window.matchMedia("(max-width: 1023px)").matches) select(null);
          break;
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [visible, selectedId, select, archive]);

  // ── Respuestas rápidas ─────────────────────────────────────────────────────

  const composerQuickReplies: ComposerQuickReplies = {
    ready: initialQuickReplies.ready,
    items: quickReplies,
    onSendAudio: (reply) => {
      if (selectedId) sendAudio(selectedId, reply);
    },
    onSaveText: async (title, body) => {
      const result = await createTextQuickReply({ title, body });
      if (result.ok && result.item) setQuickReplies((items) => [...items, result.item!]);
      return result;
    },
    onRecord: () => setRecorderOpen(true),
    onUsed: (reply) => {
      setQuickReplies((items) => items.map((item) => (item.id === reply.id ? { ...item, useCount: item.useCount + 1 } : item)));
      if (reply.kind === "TEXTO") void markQuickReplyUsed(reply.id);
    },
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const thread = selectedId ? threads[selectedId] : undefined;
  const selectedItem = selectedId ? (thread?.detail.conversation ?? activeItems.find((item) => item.id === selectedId) ?? archivedItems?.find((item) => item.id === selectedId)) : undefined;
  const panelConversation = thread ? (activeItems.find((item) => item.id === selectedId) ?? archivedItems?.find((item) => item.id === selectedId) ?? thread.detail.conversation) : undefined;
  const showPanel = Boolean(thread && panelOpen);

  const emptyHint = search
    ? "Ninguna conversación coincide con la búsqueda."
    : tag
      ? "Ninguna conversación tiene esa etiqueta acá."
      : filter === "sin_leer"
        ? "No tenés mensajes sin leer."
        : filter === "por_responder"
          ? "No hay nadie esperando tu respuesta. 👌"
          : filter === "ventana"
            ? "Ninguna ventana de 24 h está por cerrarse."
            : filter === "seguimiento"
              ? "No tenés seguimientos para hoy."
              : filter === "archivadas"
                ? archivedItems === null
                  ? "Cargando…"
                  : "No hay conversaciones archivadas."
                : "Todavía no hay conversaciones.";

  return (
    <div className={cn("grid min-h-0 flex-1 lg:grid-cols-[340px_minmax(0,1fr)]", showPanel && "xl:grid-cols-[340px_minmax(0,1fr)_300px]")}>
      <aside className={cn("min-h-0 border-r border-lm-line", selectedId ? "hidden lg:block" : "")}>
        <ConversationList
          items={visible}
          selectedId={selectedId}
          onSelect={(id) => select(id)}
          onPrefetch={prefetch}
          filter={filter}
          onFilterChange={changeFilter}
          counts={counts}
          search={search}
          onSearchChange={changeSearch}
          searchRef={searchRef}
          tags={tags}
          tag={tag}
          onTagChange={changeTag}
          labels={labels}
          loading={listLoading && (filter === "archivadas" || Boolean(search))}
          emptyHint={emptyHint}
          now={now}
        />
      </aside>

      <section className={cn("min-h-0", selectedId ? "" : "hidden lg:block")}>
        {thread ? (
          <div key={thread.detail.conversation.id} className="lm-rise h-full min-h-0">
            <ChatThread
              thread={thread}
              onSend={(text) => sendText(thread.detail.conversation.id, text)}
              onRetry={(message) => retry(thread.detail.conversation.id, message)}
              onLoadOlder={() => loadOlder(thread.detail.conversation.id)}
              onArchive={() => archive(thread.detail.conversation.id)}
              onBack={() => select(null)}
              onTogglePanel={togglePanel}
              panelOpen={panelOpen}
              quickReplies={composerQuickReplies}
              now={now}
            />
          </div>
        ) : selectedId && !missing.has(selectedId) ? (
          <ThreadSkeleton item={selectedItem} />
        ) : (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="flex max-w-xs flex-col items-center gap-2">
              <MessageSquare className="size-6 text-lm-ink-3" strokeWidth={1.5} />
              <p className="font-lm-sans text-[13.5px] text-lm-ink-2">{selectedId ? "No se encontró esa conversación." : "Elegí una conversación para leerla y responder."}</p>
              <p className="text-xs text-lm-ink-3">J y K para moverte · / para buscar · E para archivar</p>
            </div>
          </div>
        )}
      </section>

      {thread && panelConversation && panelOpen ? (
        <>
          {/* Debajo de xl el panel flota sobre el hilo; desde xl es una columna fija. */}
          <div className="fixed inset-0 z-30 bg-lm-scrim xl:hidden" onClick={togglePanel} aria-hidden />
          <aside className="lm-glass-pop fixed inset-y-0 right-0 z-40 w-[min(320px,90vw)] border-l border-lm-line xl:static xl:z-auto xl:w-auto xl:bg-transparent xl:backdrop-blur-none">
            <ContactPanel
              conversation={panelConversation}
              lead={thread.detail.lead}
              canLink={thread.detail.account.isOwner}
              labels={labels}
              allTags={tags.map((entry) => entry.tag)}
              automation={panelConversation.source_automation_id ? (automationById.get(panelConversation.source_automation_id) ?? null) : null}
              extrasReady={extrasReady && thread.detail.extrasReady}
              onPatch={(patch) => patchConversation(panelConversation.id, patch)}
              onLeadChanged={() => {
                void fetchThread(panelConversation.id);
                reloadList("activas");
              }}
              onClose={togglePanel}
            />
          </aside>
        </>
      ) : null}

      <AudioRecorderDialog open={recorderOpen} onClose={() => setRecorderOpen(false)} onSaved={(item) => setQuickReplies((items) => [...items, item])} />
    </div>
  );
}

/** Mientras llega un hilo que no estaba en memoria: la forma real de la pantalla, con lo que ya se sabe. */
function ThreadSkeleton({ item }: { item?: ConversationListItem }) {
  return (
    <div className="flex h-full min-h-0 flex-col" role="status" aria-label="Cargando la conversación">
      <div className="flex items-center gap-3 border-b border-lm-line px-4 py-3">
        <div className="size-10 shrink-0 rounded-full bg-lm-raised" />
        <div className="flex flex-col gap-1.5">
          {item ? <span className="font-lm-sans text-[15px] font-semibold text-lm-ink">{item.participant_name || (item.participant_handle ? `@${item.participant_handle}` : "")}</span> : <div className="lm-smoke w-40" />}
          <div className="lm-smoke w-28" />
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-end gap-3 px-4 py-4">
        {[60, 38, 72, 45].map((width, index) => (
          <div key={index} className={cn("flex", index % 2 ? "justify-end" : "justify-start")}>
            <div className="h-9 rounded-lm-md bg-lm-raised" style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
      <div className="h-[74px] border-t border-lm-line bg-lm-surface" />
    </div>
  );
}
