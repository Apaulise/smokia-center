"use client";

import { Archive, ArrowLeft, ArrowUpRight, FileText, Inbox, Mail, Pencil, RefreshCw, Search, Send, ShieldAlert, Star, Tag, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Button, ButtonExternalLink, ButtonLink } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { changeMail, deleteDraft, loadDraft, loadMailbox, loadThread, replyDetails } from "@/lib/mail/actions";
import { folders, type Folder, type InboxRow, type MailChange, type MailList, type MailMessage, type ReplyMode } from "@/lib/mail/types";
import { cn } from "@/lib/utils";
import { emptyCompose, MailComposerDialog, type ComposeData } from "./compose";
import { MailThread } from "./thread";

const icons = { inbox: Inbox, starred: Star, sent: Send, drafts: FileText, all: Mail, archive: Archive, spam: ShieldAlert, trash: Trash2 };
const date = new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short" });
const time = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit" });
const formatDate = (timestamp: number) => {
  if (!timestamp) return "";
  const parsed = new Date(timestamp);
  return parsed.toDateString() === new Date().toDateString() ? time.format(parsed) : date.format(parsed);
};

export function Mailbox({ email, connection }: { email: string; connection: string }) {
  const [folder, setFolder] = useState<Folder>("inbox");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [list, setList] = useState<MailList>({ rows: [], labels: [] });
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<{ id: string; title: string; messages?: MailMessage[]; error?: string } | null>(null);
  const [compose, setCompose] = useState<ComposeData | null>(null);
  const listVersion = useRef(0);
  const threadVersion = useRef(0);
  const lock = useRef(false);
  const { confirm, confirmDialog } = useConfirm();
  const invalidateList = useCallback(() => { listVersion.current++; }, []);

  const refresh = useCallback(async (cursor?: string) => {
    const version = ++listVersion.current;
    setLoading(true);
    setListError("");
    try {
      const result = await loadMailbox(connection, folder, search, cursor);
      if (version !== listVersion.current) return;
      if (result.ok) {
        setList((previous) => cursor ? {
          ...result.value, rows: [...new Map([...previous.rows, ...result.value.rows].map((row) => [row.id, row])).values()],
        } : result.value);
      } else {
        setListError(result.error);
        setList({ rows: [], labels: [] });
      }
    } catch {
      if (version === listVersion.current) setListError("Se interrumpió la conexión. Volvé a intentar.");
    } finally {
      if (version === listVersion.current) setLoading(false);
    }
  }, [connection, folder, search]);

  const readThread = useCallback(async (id: string, title: string, markRead: boolean) => {
    const version = ++threadVersion.current;
    try {
      const result = await loadThread(connection, id);
      if (version !== threadVersion.current) return;
      if (!result.ok) {
        setThread({ id, title, error: result.error });
        return;
      }
      setThread({ id, title, messages: result.value });
      if (markRead && result.value.some((message) => message.labels.includes("UNREAD"))) {
        const updated = await changeMail(connection, id, "read");
        if (updated.ok && version === threadVersion.current) {
          setThread((current) => current?.id === id ? { ...current,
            messages: current.messages?.map((message) => ({ ...message, labels: message.labels.filter((label) => label !== "UNREAD") })),
          } : current);
          setList((current) => ({ ...current, rows: current.rows.map((row) => row.id === id ? {
            ...row, labels: row.labels.filter((label) => label !== "UNREAD"),
          } : row) }));
        }
      }
    } catch {
      if (version === threadVersion.current) setThread({ id, title, error: "No pudimos abrir el hilo. Volvé a intentar." });
    }
  }, [connection]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => { window.clearTimeout(timer); invalidateList(); };
  }, [invalidateList, refresh]);

  const refreshView = useCallback(() => {
    void refresh();
    if (thread) void readThread(thread.id, thread.title, false);
  }, [refresh, readThread, thread]);
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && !lock.current) refreshView();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refreshView]);

  function closeThread() {
    threadVersion.current++;
    setThread(null);
  }

  function navigate(next: Folder) {
    if (next === folder) return;
    closeThread();
    listVersion.current++;
    setList((current) => ({ labels: current.labels, rows: [] }));
    setListError("");
    setActionError("");
    setFolder(next);
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    const value = searchInput.trim();
    if (search === value) { refreshView(); return; }
    closeThread();
    listVersion.current++;
    setList((current) => ({ labels: current.labels, rows: [] }));
    setSearch(value);
  }

  async function perform<T>(action: () => Promise<{ ok: true; value: T } | { ok: false; error: string }>, success: (value: T) => void) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setActionError("");
    setNotice("");
    try {
      const result = await action();
      if (result.ok) success(result.value);
      else setActionError(result.error);
    } catch {
      setActionError("Se interrumpió la conexión. Volvé a intentar.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function open(row: InboxRow) {
    setActionError("");
    if (row.draft) {
      void perform(() => loadDraft(connection, row.id), (value) => setCompose({ ...value, draft: row.id, draftMessage: value.id }));
      return;
    }
    setThread({ id: row.id, title: row.subject });
    void readThread(row.id, row.subject, true);
  }

  function modify(change: MailChange, label?: string) {
    if (!thread) return;
    const { id, title } = thread;
    void perform(() => changeMail(connection, id, change, label), () => {
      if (["unread", "trash", "restore", "archive", "spam", "not-spam"].includes(change)) closeThread();
      else void readThread(id, title, false);
      void refresh();
    });
  }

  function reply(message: MailMessage, mode: ReplyMode) {
    void perform(() => replyDetails(connection, message.id, mode),
      (value) => setCompose({ ...value, source: message.id, mode }));
  }

  async function discard(row: Extract<InboxRow, { draft: true }>) {
    if (!await confirm({ title: "¿Descartar el borrador?", description: "El borrador se elimina también de Gmail.",
      confirmLabel: "Descartar", tone: "danger" })) return;
    await perform(() => deleteDraft(connection, row.id, row.draftMessageId), () => { setNotice("Borrador descartado."); void refresh(); });
  }

  const title = folders.find(([key]) => key === folder)?.[1]
    ?? list.labels.find(({ id }) => folder === `label:${id}`)?.name ?? "Etiqueta";
  return (
    <div className="min-w-0 px-3 pb-5 pt-4 sm:px-6 lg:px-8">
      <header className={cn("mb-4 flex min-w-0 flex-wrap items-center justify-between gap-3", thread && "hidden lg:flex")}>
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Correo</h1>
          <p className="truncate text-xs text-lm-ink-2">{email}</p>
        </div>
        <Button variant="primary" className="min-h-10" onClick={() => setCompose(emptyCompose)} disabled={busy}>
          <Pencil className="size-4" /> Redactar
        </Button>
      </header>
      {notice && <p className="mb-3 text-sm text-lm-success" role="status">{notice}</p>}
      {actionError && <p className="mb-3 break-words rounded-lm-md border border-lm-danger/25 bg-lm-danger-soft p-3 text-sm text-lm-danger" role="alert">{actionError}</p>}
      <div className="overflow-hidden rounded-lm-xl border border-lm-line bg-lm-ink/3 lg:grid lg:min-h-[calc(100dvh-10rem)] lg:grid-cols-[11rem_minmax(0,1fr)] xl:grid-cols-[13rem_minmax(0,1fr)]">
        <nav aria-label="Carpetas de Gmail" className={cn(
          "flex min-w-0 items-center gap-1 overflow-x-auto overscroll-x-contain border-b border-lm-line p-2 lg:flex-col lg:items-stretch lg:overflow-visible lg:border-b-0 lg:border-r lg:p-3",
          thread && "hidden lg:flex",
        )}>
          {folders.map(([id, label]) => {
            const Icon = icons[id];
            return <Button key={id} disabled={busy} aria-current={folder === id ? "page" : undefined} variant="ghost"
              className={cn("min-h-10 justify-start", folder === id && "bg-lm-signal/15 text-lm-signal-text")} onClick={() => navigate(id)}>
              <Icon className="size-4" /> {label}
            </Button>;
          })}
          {list.labels.length > 0 && <span className="ml-1 hidden border-t border-lm-line pt-3 text-xs text-lm-ink-3 lg:block">Etiquetas</span>}
          {list.labels.map((label) => <Button key={label.id} disabled={busy} variant="ghost"
            aria-current={folder === `label:${label.id}` ? "page" : undefined}
            className={cn("min-h-10 max-w-52 justify-start lg:max-w-none lg:shrink", folder === `label:${label.id}` && "bg-lm-signal/15 text-lm-signal-text")}
            onClick={() => navigate(`label:${label.id}`)}><Tag className="size-4 shrink-0" /><span className="truncate">{label.name}</span></Button>)}
        </nav>
        <div className="min-w-0">
          <div className={cn("flex min-w-0 items-center gap-1.5 border-b border-lm-line p-2 sm:p-3", thread && "hidden lg:flex")}>
            <form onSubmit={submitSearch} className="flex min-w-0 flex-1 gap-1">
              <label className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lm-md border border-lm-line bg-lm-ink/4 px-2 sm:px-3">
                <Search className="size-4 shrink-0 text-lm-ink-3" />
                <input maxLength={1000} className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-lm-ink-3 md:text-sm"
                  aria-label="Buscar en el correo" placeholder="Buscar en el correo" value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)} />
              </label>
              <Button type="submit" className="min-h-10" variant="ghost" disabled={busy}>Buscar</Button>
            </form>
            <Button className="min-h-10 px-2" variant="ghost" aria-label="Actualizar correo" title="Actualizar correo" disabled={loading || busy} onClick={refreshView}>
              <RefreshCw className={cn("size-4", loading && "motion-safe:animate-spin")} />
            </Button>
            <ButtonExternalLink className="hidden min-h-10 sm:inline-flex" variant="ghost" aria-label="Abrir Gmail" title="Abrir Gmail"
              href={`https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}`}><ArrowUpRight className="size-4" /></ButtonExternalLink>
          </div>
          {thread ? (
            thread.messages ? <MailThread email={email} connection={connection} folder={folder} messages={thread.messages} labels={list.labels} busy={busy}
              close={closeThread} modify={modify} reply={reply} />
              : <div className="space-y-4 p-4 sm:p-6">
                <Button className="min-h-10" onClick={closeThread} variant="ghost"><ArrowLeft className="size-4" /> Volver a la bandeja</Button>
                <h2 className="break-words text-lg font-semibold">{thread.title || "(Sin asunto)"}</h2>
                {thread.error ? <div role="alert" className="space-y-3 text-sm text-lm-danger"><p>{thread.error}</p>
                  <Button className="min-h-10" onClick={() => void readThread(thread.id, thread.title, true)}>Reintentar</Button></div>
                  : <p role="status" className="text-sm text-lm-ink-2">Cargando conversación…</p>}
              </div>
          ) : <>
            <div className="flex items-center justify-between gap-2 border-b border-lm-line px-4 py-3">
              <h2 className="truncate text-sm font-semibold">{search ? `Resultados en ${title}` : title}</h2>
              {search && <Button className="min-h-9" variant="ghost" onClick={() => { setSearchInput(""); setSearch(""); }}>Limpiar búsqueda</Button>}
            </div>
            {listError && <div className="space-y-3 px-4 py-6 text-sm" role="alert">
              <p className="text-lm-danger">{listError}</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void refresh()} className="min-h-10">Reintentar</Button>
                <ButtonLink className="min-h-10" href="/configuracion#gmail" variant="ghost">Ir a Configuración</ButtonLink>
              </div>
            </div>}
            {!listError && list.rows.length === 0 && <p role="status" className="px-4 py-8 text-sm text-lm-ink-2">
              {loading ? "Cargando correo…" : search ? "No hay mensajes para esa búsqueda." : "Todavía no hay mensajes en esta carpeta."}
            </p>}
            <ul className="divide-y divide-lm-line">
              {list.rows.map((row) => {
                const unread = row.labels.includes("UNREAD");
                return <li key={row.id} className="flex min-w-0 items-center">
                  <button type="button" disabled={busy} onClick={() => open(row)}
                    className={cn("grid min-h-16 min-w-0 flex-1 cursor-pointer grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-lm-ink/6 focus-visible:lm-focus lg:grid-cols-[minmax(6rem,11rem)_minmax(0,1fr)_auto]",
                      unread && "bg-lm-signal/6")}>
                    <span className={cn("min-w-0 truncate text-sm", unread && "font-semibold")}>
                      {row.draft ? row.from ? `Para ${row.from}` : "Borrador" : row.from || "Remitente desconocido"}
                    </span>
                    <span className="col-start-2 row-start-1 self-center text-xs text-lm-ink-3 lg:col-start-3">
                      {row.labels.includes("STARRED") && <Star className="mr-1 inline size-3 fill-current text-lm-signal-text" />}
                      {formatDate(row.date)}
                    </span>
                    <span className="col-span-2 min-w-0 truncate text-sm lg:col-span-1 lg:col-start-2 lg:row-start-1">
                      {unread && <span className="mr-1.5 inline-block size-1.5 rounded-full bg-lm-signal-text" aria-label="No leído" />}
                      <span className={cn(unread && "font-semibold")}>{row.subject || "(Sin asunto)"}</span>
                      {row.snippet && <span className="text-lm-ink-2"> · {row.snippet}</span>}
                    </span>
                    {list.labels.some(({ id }) => row.labels.includes(id)) && <span className="col-span-2 flex min-w-0 gap-1 overflow-hidden lg:col-start-2">
                      {list.labels.filter(({ id }) => row.labels.includes(id)).slice(0, 4).map(({ id, name }) =>
                        <span key={id} className="max-w-28 truncate rounded-lm-sm bg-lm-ink/8 px-1.5 py-0.5 text-[11px]">{name}</span>)}
                    </span>}
                  </button>
                  {row.draft && <Button variant="ghost" className="mr-2 min-h-10" aria-label="Descartar borrador" title="Descartar borrador"
                    disabled={busy} onClick={() => void discard(row)}><Trash2 className="size-4" /></Button>}
                </li>;
              })}
            </ul>
            {list.next && <div className="p-4"><Button disabled={loading} className="min-h-10" onClick={() => void refresh(list.next)}>
              {loading ? "Cargando…" : "Cargar más"}</Button></div>}
          </>}
        </div>
      </div>
      {compose && <MailComposerDialog email={email} connection={connection} initial={compose} onClose={() => setCompose(null)} onSaved={(intent) => {
        setCompose(null);
        setNotice(intent === "send" ? "Correo enviado." : "Borrador guardado en Gmail.");
        refreshView();
      }} />}
      {confirmDialog}
    </div>
  );
}
