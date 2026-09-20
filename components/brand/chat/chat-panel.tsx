"use client";

import { Loader2, Plus, Send } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";

import { ChatMessage } from "./chat-message";
import { SaveIdeaDialog } from "./save-idea-dialog";
import { ChatThreadList } from "./thread-list";
import { Button } from "@/components/ui/button";
import { sendBrandChatMessage } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type ChatThreadRow = Database["public"]["Tables"]["brand_chat_threads"]["Row"];
type ChatMessageRow = Database["public"]["Tables"]["brand_chat_messages"]["Row"];

function userTurnContent(text: string): Json {
  return [{ role: "user", content: text }] as unknown as Json;
}

/** Deja `?hilo=<id>` en la barra para que F5 vuelva a la misma conversación, sin pedirle nada al servidor. */
function syncUrl(threadId: string | null) {
  window.history.replaceState(null, "", threadId ? `?hilo=${threadId}` : window.location.pathname);
}

/**
 * El chat de generación de contenido (Plans/03 §3.6). A la izquierda, el
 * historial de conversaciones; a la derecha, la abierta. Un hilo recién se
 * crea en la base al mandar el primer mensaje (sendBrandChatMessage lo hace
 * lazy), así que abrir la pantalla o apretar "Nueva conversación" no deja
 * hilos vacíos. Cambiar de hilo lee sus mensajes directo de Supabase con la
 * sesión del usuario (RLS), sin pasar por el servidor de la app.
 *
 * El texto de la respuesta no llega por streaming HTTP: lib/brand/ai/chat.ts
 * corre en un after() de la Server Action y va escribiendo brand_chat_messages
 * a medida que Claude responde — acá sólo se escucha por Realtime, mismo
 * patrón que components/brand/sync-panel.tsx.
 */
export function BrandChatPanel({
  platform,
  ownerId,
  initialThreads,
  initialThread,
  initialMessages,
}: {
  platform: BrandPlatform;
  ownerId: string;
  initialThreads: ChatThreadRow[];
  initialThread: ChatThreadRow | null;
  initialMessages: ChatMessageRow[];
}) {
  const [threads, setThreads] = useState(initialThreads);
  const [threadId, setThreadId] = useState(initialThread?.id ?? null);
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [loadingThread, setLoadingThread] = useState(false);
  const [ideaDraft, setIdeaDraft] = useState<{ messageId: string; text: string } | null>(null);
  const [savedMessageIds, setSavedMessageIds] = useState<ReadonlySet<string>>(new Set());
  const supabaseRef = useRef(createClient());
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const threadIdRef = useRef(threadId);
  // Cuenta las aperturas de hilo: si el usuario cambia de opinión mientras una carga, sólo vale la última.
  const loadRequestRef = useRef(0);

  useEffect(() => {
    threadIdRef.current = threadId;
  }, [threadId]);

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`brand_chat_messages_${ownerId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "brand_chat_messages", filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow;
          if (row.thread_id !== threadIdRef.current) return;
          setMessages((prev) => prev.map((m) => (m.id === row.id ? row : m)));
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ownerId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // El input crece con el texto hasta el tope del max-h-40 (160px), como en el diseño.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  const busy = pending || messages.some((m) => m.role === "ASISTENTE" && m.status === "EN_CURSO");
  const activeTitle = threadId ? (threads.find((t) => t.id === threadId)?.title ?? null) : null;

  function handleNewThread() {
    loadRequestRef.current += 1;
    setLoadingThread(false);
    setThreadId(null);
    setMessages([]);
    setInput("");
    setError(null);
    syncUrl(null);
  }

  async function handleSelectThread(id: string) {
    if (id === threadIdRef.current) return;

    const requestId = ++loadRequestRef.current;
    setLoadingThread(true);
    setError(null);

    const { data, error: loadError } = await supabaseRef.current
      .from("brand_chat_messages")
      .select("*")
      .eq("thread_id", id)
      .order("created_at", { ascending: true });

    if (requestId !== loadRequestRef.current) return;
    setLoadingThread(false);

    if (loadError) {
      setError("No se pudo abrir la conversación.");
      return;
    }

    setThreadId(id);
    setMessages(data ?? []);
    setInput("");
    syncUrl(id);
  }

  function handleSend() {
    const text = input.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");

    const now = new Date().toISOString();
    const optimisticUser: ChatMessageRow = {
      id: crypto.randomUUID(),
      owner_id: ownerId,
      thread_id: threadId ?? "",
      role: "USUARIO",
      status: "COMPLETADO",
      content: userTurnContent(text),
      error: null,
      created_at: now,
      updated_at: now,
    };
    setMessages((prev) => [...prev, optimisticUser]);

    startTransition(async () => {
      const result = await sendBrandChatMessage({ threadId, platform, text });
      if (!result.ok) {
        setError(result.message);
        setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
        setInput(text);
        return;
      }

      setThreadId(result.threadId);
      // Un hilo recién creado entra arriba del historial; el título es el mismo recorte que guarda el servidor.
      setThreads((prev) =>
        prev.some((t) => t.id === result.threadId)
          ? prev
          : [
              {
                id: result.threadId,
                owner_id: ownerId,
                platform,
                title: text.slice(0, 80),
                created_at: now,
                updated_at: now,
              },
              ...prev,
            ],
      );
      syncUrl(result.threadId);

      const placeholderAssistant: ChatMessageRow = {
        id: result.assistantMessageId,
        owner_id: ownerId,
        thread_id: result.threadId,
        role: "ASISTENTE",
        status: "EN_CURSO",
        content: [] as unknown as Json,
        error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, placeholderAssistant]);
    });
  }

  return (
    // Alto de pantalla completo; en mobile se descuenta la barra del menú (lg:hidden) que queda arriba.
    <div className="flex h-[calc(100dvh-61px)] min-h-[480px] overflow-hidden lg:h-dvh">
      <aside className="hidden w-72 shrink-0 border-r border-line/60 md:block">
        <ChatThreadList
          threads={threads}
          activeId={threadId}
          loading={loadingThread}
          onSelect={handleSelectThread}
          onNew={handleNewThread}
          newDisabled={messages.length === 0}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* En mobile no hay lista lateral: la acción de nueva conversación queda acá. */}
        <div className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3 md:hidden">
          <p className="truncate text-sm text-muted">{activeTitle ?? "Conversación nueva"}</p>
          <Button type="button" variant="ghost" size="sm" onClick={handleNewThread} disabled={messages.length === 0}>
            <Plus className="size-3.5" />
            Nueva conversación
          </Button>
        </div>

        <div
          className={cn(
            "flex-1 overflow-y-auto transition-opacity [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin]",
            loadingThread && "opacity-60",
          )}
        >
          <div className="mx-auto flex max-w-[760px] flex-col gap-7 px-4 pt-8 pb-6 sm:px-8 sm:pt-10">
            {messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted">
                Pedile una idea, un guion o un caption. Puede buscar en tus posts y en la web antes de responder.
              </p>
            ) : (
              messages.map((row) => (
                <ChatMessage
                  key={row.id}
                  row={row}
                  saved={savedMessageIds.has(row.id)}
                  onSaveIdea={row.role === "ASISTENTE" ? (messageId, text) => setIdeaDraft({ messageId, text }) : undefined}
                />
              ))
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <div className="shrink-0 px-4 pt-3 pb-5 sm:px-8">
          <div className="mx-auto max-w-[760px]">
            {error ? <p className="mb-2 text-xs text-danger">{error}</p> : null}
            <div className="flex items-end gap-3 rounded-[16px] border border-line bg-elevated/80 py-3 pr-3 pl-5 transition-colors focus-within:border-cyan/40">
              <textarea
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Escribí lo que necesitás para el próximo contenido…"
                disabled={busy}
                className="max-h-40 flex-1 resize-none border-none bg-transparent py-1.5 text-[14.5px] leading-normal text-ink outline-none placeholder:text-muted/60 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={busy || !input.trim()}
                aria-label="Enviar mensaje"
                className="flex size-[38px] shrink-0 items-center justify-center rounded-[10px] bg-cyan text-(--color-base) transition-colors hover:bg-cyan-soft focus-visible:ring-2 focus-visible:ring-cyan/40 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40"
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <SaveIdeaDialog
        key={ideaDraft?.messageId ?? "closed"}
        open={ideaDraft !== null}
        initialText={ideaDraft?.text ?? ""}
        platform={platform}
        threadId={threadId}
        onClose={() => setIdeaDraft(null)}
        onSaved={() => {
          if (ideaDraft) setSavedMessageIds((prev) => new Set(prev).add(ideaDraft.messageId));
        }}
      />
    </div>
  );
}
