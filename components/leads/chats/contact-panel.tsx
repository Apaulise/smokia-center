"use client";

import { AlarmClock, Check, ExternalLink, Loader2, Megaphone, Plus, RefreshCw, Tag, X } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import { LeadLink } from "@/components/leads/chats/conversation-actions";
import { ChatTasks } from "@/components/leads/crm/chat-tasks";
import { StageMark, TAG_DOT, TAG_TONE, TagChip } from "@/components/leads/chats/tag-chip";
import type { TagLabelRow } from "@/lib/chats/db";
import { changeConversationTags, refreshConversationTags, setConversationFollowUp } from "@/lib/chats/inbox-actions";
import type { ConversationListItem } from "@/lib/chats/queries";
import { normalizeTag, orderTags, PRESET_TAGS, presetOf, stageOf } from "@/lib/chats/tag-view";
import { cn } from "@/lib/utils";

export type AutomationSummary = { id: string; stage: "TOFU" | "MOFU"; keywords: string[]; permalink: string | null; resourceTitle: string };

const TIME_ZONE = "America/Argentina/Buenos_Aires";

function Block({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-b border-lm-line px-4 py-3.5">
      <div className="flex items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 font-lm-sans text-[11px] font-semibold tracking-[0.08em] text-lm-ink-3 uppercase">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Mañana a las 10, en 3 días, en una semana: siempre a las 10 de la mañana (hora de Argentina ≈ la del navegador). */
function inDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(10, 0, 0, 0);
  return date.toISOString();
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formatFollowUp(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", { timeZone: TIME_ZONE, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

/**
 * El panel derecho del hilo: en qué etapa está la persona (las etiquetas que
 * pusieron los workflows de Zernio), su seguimiento, el lead y de qué pieza
 * llegó. Los cambios son optimistas: se ven en el acto y se revierten si
 * Zernio o la base los rechazan.
 */
export function ContactPanel({
  conversation,
  lead,
  canLink,
  labels,
  allTags,
  automation,
  extrasReady,
  onPatch,
  onLeadChanged,
  onClose,
}: {
  conversation: ConversationListItem;
  lead: { id: string; name: string; status: string } | null;
  canLink: boolean;
  labels: Map<string, TagLabelRow>;
  /** Las etiquetas que hay en la bandeja, para sugerir. */
  allTags: string[];
  automation: AutomationSummary | null;
  extrasReady: boolean;
  onPatch: (patch: Partial<ConversationListItem>) => void;
  onLeadChanged: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [tagPending, startTag] = useTransition();
  const [followPending, startFollow] = useTransition();
  const [followMessage, setFollowMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState(conversation.follow_up_note ?? "");
  const [noteFor, setNoteFor] = useState(conversation.id);
  if (noteFor !== conversation.id) {
    // Otro chat: la nota del formulario es la de ése (ajuste en render, sin efecto).
    setNoteFor(conversation.id);
    setNote(conversation.follow_up_note ?? "");
    setFollowMessage(null);
    setTagError(null);
    setDraft("");
  }

  const tags = conversation.tags ?? [];
  const views = orderTags(tags, labels);
  const stage = stageOf(tags, labels);
  // Las predefinidas tienen sus propios botones: acá sólo se sugieren las otras.
  const suggestions = [...new Set([...allTags, ...labels.keys()])]
    .filter((tag) => !presetOf(tag) && !tags.includes(tag) && (!draft || tag.includes(normalizeTag(draft) ?? "\u0000")))
    .slice(0, 6);
  const otherViews = views.filter((view) => !view.color);

  function changeTags(add: string[], remove: string[]) {
    const previous = tags;
    const next = [...new Set([...tags.filter((tag) => !remove.includes(tag)), ...add])];
    onPatch({ tags: next });
    setTagError(null);
    startTag(async () => {
      const result = await changeConversationTags({ conversationId: conversation.id, add, remove });
      if (!result.ok) {
        onPatch({ tags: previous });
        setTagError(result.message);
      } else if (result.tags) {
        onPatch({ tags: result.tags });
      }
    });
  }

  function addDraft() {
    const tag = normalizeTag(draft);
    if (!tag) return;
    setDraft("");
    if (!tags.includes(tag)) changeTags([tag], []);
  }

  function refresh() {
    setTagError(null);
    startTag(async () => {
      const result = await refreshConversationTags(conversation.id);
      if (result.ok && result.tags) onPatch({ tags: result.tags });
      else if (!result.ok) setTagError(result.message);
    });
  }

  function schedule(at: string | null) {
    const previous = { follow_up_at: conversation.follow_up_at, follow_up_note: conversation.follow_up_note };
    onPatch({ follow_up_at: at, follow_up_note: at ? note.trim() || null : null });
    setFollowMessage(null);
    startFollow(async () => {
      const result = await setConversationFollowUp({ conversationId: conversation.id, at, note: note.trim() || null });
      setFollowMessage({ ok: result.ok, text: result.message });
      if (!result.ok) onPatch(previous);
    });
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-lm-line px-4 py-2.5">
        <span className="font-lm-sans text-[13px] font-semibold text-lm-ink">Contacto</span>
        <button type="button" onClick={onClose} aria-label="Cerrar el panel" className="grid size-7 place-items-center rounded-lm-sm text-lm-ink-3 hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus">
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!extrasReady ? (
          <p className="border-b border-lm-line px-4 py-3 text-[12.5px] text-lm-ink-2">
            Falta aplicar las migraciones de §1.26 (`npm run db:push`) para ver etiquetas, seguimiento y de qué pieza llegó cada persona.
          </p>
        ) : null}

        <Block
          title="Etapa y etiquetas"
          icon={<Tag className="size-3" strokeWidth={1.5} />}
          action={
            extrasReady ? (
              <button type="button" onClick={refresh} disabled={tagPending} title="Traer las etiquetas de Zernio" aria-label="Traer las etiquetas de Zernio" className="grid size-6 place-items-center rounded-lm-xs text-lm-ink-3 hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus disabled:opacity-50">
                {tagPending ? <Loader2 className="size-3 animate-spin" /> : <RefreshCw className="size-3" strokeWidth={1.5} />}
              </button>
            ) : null
          }
        >
          {stage ? (
            <div className="flex items-center gap-2 text-[12.5px] text-lm-ink-2">
              <StageMark stage={stage} />
              {stage === "TOFU" ? "Llegó por contenido de alcance" : stage === "MOFU" ? "Ya mostró interés" : "Calificado para vender"}
            </div>
          ) : null}
          {/* Las cuatro predefinidas: un toque la pone, otro la saca. */}
          <div className="grid grid-cols-2 gap-1.5" role="group" aria-label="Etiquetas predefinidas">
            {PRESET_TAGS.map((preset) => {
              const applied = tags.includes(preset.tag);
              return (
                <button
                  key={preset.tag}
                  type="button"
                  aria-pressed={applied}
                  title={preset.hint}
                  disabled={!extrasReady || tagPending}
                  onClick={() => (applied ? changeTags([], [preset.tag]) : changeTags([preset.tag], []))}
                  className={cn(
                    "inline-flex h-8 items-center gap-2 rounded-lm-sm border px-2.5 font-lm-sans text-[12.5px] transition-colors duration-150 ease-out focus-visible:lm-focus disabled:opacity-55",
                    applied ? cn(TAG_TONE[preset.color], "font-medium") : "border-lm-line text-lm-ink-2 hover:border-lm-line-strong hover:text-lm-ink",
                  )}
                >
                  {applied ? null : <span className={cn("size-2 shrink-0 rounded-full opacity-70", TAG_DOT[preset.color])} aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-left">{preset.label}</span>
                  {applied ? <Check className="size-3.5 shrink-0" strokeWidth={2} aria-hidden /> : null}
                </button>
              );
            })}
          </div>
          {otherViews.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {otherViews.map((view) => (
                <TagChip key={view.tag} view={view} onRemove={extrasReady ? () => changeTags([], [view.tag]) : undefined} />
              ))}
            </div>
          ) : null}
          {extrasReady ? (
            <>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  addDraft();
                }}
                method="post"
                className="flex gap-1.5"
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Otra etiqueta"
                  aria-label="Agregar otra etiqueta"
                  maxLength={48}
                  className="h-7 min-w-0 flex-1 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-2 font-lm-sans text-[12.5px] text-lm-ink placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none"
                />
                <button type="submit" disabled={!draft.trim()} aria-label="Agregar" className="grid size-7 place-items-center rounded-lm-sm border border-lm-line-strong text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus disabled:opacity-45">
                  <Plus className="size-3.5" strokeWidth={1.5} />
                </button>
              </form>
              {suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {suggestions.map((tag) => (
                    <button key={tag} type="button" onClick={() => changeTags([tag], [])} className="rounded-lm-xs border border-dashed border-lm-line px-1.5 py-0.5 font-lm-sans text-[11px] text-lm-ink-3 hover:border-lm-line-strong hover:text-lm-ink focus-visible:lm-focus">
                      + {orderTags([tag], labels)[0]?.label ?? tag}
                    </button>
                  ))}
                </div>
              ) : null}
              <p className="text-[11.5px] text-lm-ink-3">Se guardan en Zernio: los workflows y las difusiones las ven igual.</p>
            </>
          ) : null}
          {tagError ? (
            <p className="text-xs text-lm-danger" role="alert">
              {tagError}
            </p>
          ) : null}
        </Block>

        <Block title="Seguimiento" icon={<AlarmClock className="size-3" strokeWidth={1.5} />}>
          {conversation.follow_up_at ? (
            <p className="text-[13px] text-lm-ink">
              <span className="font-mono">{formatFollowUp(conversation.follow_up_at)}</span>
              {conversation.follow_up_note ? <span className="text-lm-ink-2"> · {conversation.follow_up_note}</span> : null}
            </p>
          ) : null}
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={280}
            placeholder="Nota (opcional): qué le tenés que decir"
            aria-label="Nota del seguimiento"
            disabled={!extrasReady}
            className="h-7 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-2 font-lm-sans text-[12.5px] text-lm-ink placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none disabled:opacity-50"
          />
          <div className="flex flex-wrap gap-1.5">
            {[
              { label: "Mañana", days: 1 },
              { label: "En 3 días", days: 3 },
              { label: "En una semana", days: 7 },
            ].map((option) => (
              <button
                key={option.days}
                type="button"
                disabled={!extrasReady || followPending}
                onClick={() => schedule(inDays(option.days))}
                className="h-7 rounded-lm-sm border border-lm-line-strong px-2 font-lm-sans text-[12px] text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus disabled:opacity-45"
              >
                {option.label}
              </button>
            ))}
            <input
              type="datetime-local"
              aria-label="Fecha y hora del seguimiento"
              disabled={!extrasReady || followPending}
              defaultValue={toLocalInput(conversation.follow_up_at)}
              key={`${conversation.id}:${conversation.follow_up_at ?? ""}`}
              onChange={(event) => {
                if (event.target.value) schedule(new Date(event.target.value).toISOString());
              }}
              className="h-7 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-1.5 font-mono text-[11.5px] text-lm-ink-2 focus:border-lm-signal focus:outline-none disabled:opacity-45"
            />
            {conversation.follow_up_at ? (
              <button type="button" disabled={followPending} onClick={() => schedule(null)} className="h-7 rounded-lm-sm px-2 font-lm-sans text-[12px] text-lm-ink-3 hover:text-lm-danger focus-visible:lm-focus">
                Borrar
              </button>
            ) : null}
          </div>
          {followMessage ? (
            <p className={cn("text-xs", followMessage.ok ? "text-lm-success" : "text-lm-danger")} role="status">
              {followMessage.text}
              {followMessage.ok && lead ? " También quedó como próxima acción del lead." : ""}
            </p>
          ) : null}
        </Block>

        <Block title="Tareas" icon={<Check className="size-3" aria-hidden />}>
          <ChatTasks key={conversation.id} conversationId={conversation.id} />
        </Block>

        <Block title="Lead" icon={<span className="size-1.5 rounded-full bg-lm-smoke-4" aria-hidden />}>
          <LeadLink conversationId={conversation.id} lead={lead} canLink={canLink} hasHandle={Boolean(conversation.participant_handle)} onChanged={onLeadChanged} />
        </Block>

        {automation ? (
          <Block title="Llegó por" icon={<Megaphone className="size-3" strokeWidth={1.5} />}>
            <div className="flex items-center gap-2 text-[12.5px] text-lm-ink">
              <StageMark stage={automation.stage} />
              <span className="truncate">
                Comentó <span className="font-mono">{automation.keywords[0]}</span> · {automation.resourceTitle}
              </span>
            </div>
            {automation.permalink ? (
              <a href={automation.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-lm-ink-2 hover:text-lm-ink">
                <ExternalLink className="size-3" strokeWidth={1.5} />
                Ver la pieza en Instagram
              </a>
            ) : null}
          </Block>
        ) : null}

        {conversation.participant_handle ? (
          <div className="px-4 py-3.5">
            <a
              href={`https://www.instagram.com/${conversation.participant_handle}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-lm-ink-2 hover:text-lm-ink"
            >
              <ExternalLink className="size-3" strokeWidth={1.5} />
              Ver el perfil de @{conversation.participant_handle}
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}
