"use client";

import { AlarmClock, CornerDownLeft, Link2, Loader2, Search, X } from "lucide-react";
import { memo, type RefObject } from "react";

import { StageMark, TAG_DOT, TAG_TONE, TagChip } from "@/components/leads/chats/tag-chip";
import type { TagLabelRow } from "@/lib/chats/db";
import { formatChatTime, initialsOf } from "@/lib/chats/format";
import { awaitingReply, followUpDue, openWindowLeft, WINDOW_WARNING_MS } from "@/lib/chats/inbox";
import type { ConversationFilter, ConversationListItem } from "@/lib/chats/queries";
import { describeTag, orderTags, stageOf } from "@/lib/chats/tag-view";
import { formatWindowLeft } from "@/lib/chats/window";
import { cn } from "@/lib/utils";

export const FILTER_OPTIONS: Array<{ value: ConversationFilter; label: string; hint: string }> = [
  { value: "todas", label: "Todas", hint: "Todas las conversaciones activas" },
  { value: "por_responder", label: "Por responder", hint: "El último mensaje es de la persona" },
  { value: "sin_leer", label: "Sin leer", hint: "Con mensajes que todavía no abriste" },
  { value: "ventana", label: "Por cerrar", hint: "Les quedan menos de 6 h de la ventana de 24 h" },
  { value: "seguimiento", label: "Seguimiento", hint: "Con seguimiento para hoy o vencido" },
  { value: "archivadas", label: "Archivadas", hint: "Conversaciones archivadas" },
];

type Counts = Partial<Record<ConversationFilter, number>>;

/**
 * La columna izquierda del inbox: búsqueda instantánea, filtros con contador,
 * etiquetas y las conversaciones más recientes primero. Es sólo presentación:
 * el estado lo tiene `InboxClient`, y elegir un chat no navega.
 */
export function ConversationList({
  items,
  selectedId,
  onSelect,
  onPrefetch,
  filter,
  onFilterChange,
  counts,
  search,
  onSearchChange,
  searchRef,
  tags,
  tag,
  onTagChange,
  labels,
  loading,
  emptyHint,
  now,
}: {
  items: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onPrefetch: (id: string) => void;
  filter: ConversationFilter;
  onFilterChange: (filter: ConversationFilter) => void;
  counts: Counts;
  search: string;
  onSearchChange: (value: string) => void;
  searchRef: RefObject<HTMLInputElement | null>;
  tags: Array<{ tag: string; count: number }>;
  tag: string | null;
  onTagChange: (tag: string | null) => void;
  labels: Map<string, TagLabelRow>;
  loading: boolean;
  emptyHint: string;
  now: number;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-col gap-2.5 border-b border-lm-line p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-lm-ink-3" strokeWidth={1.5} />
          <input
            ref={searchRef}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                if (search) onSearchChange("");
                else event.currentTarget.blur();
              }
            }}
            placeholder="Buscar por nombre, @usuario o etiqueta"
            aria-label="Buscar conversaciones"
            className="h-8 w-full rounded-lm-sm border border-lm-line-strong bg-lm-raised pr-8 pl-8 font-lm-sans text-[13px] text-lm-ink placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none"
          />
          {loading ? (
            <Loader2 className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-lm-ink-3" aria-label="Buscando" />
          ) : search ? (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              aria-label="Borrar la búsqueda"
              className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-lm-xs text-lm-ink-3 hover:text-lm-ink"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-lm-xs border border-lm-line px-1 font-mono text-[10.5px] text-lm-ink-3">
              /
            </kbd>
          )}
        </div>

        {/* flex-wrap, no scroll horizontal: con la barra oculta no había ninguna señal de que
            quedaban filtros a la derecha, y si el deslizar no respondía quedaban inalcanzables. */}
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filtrar conversaciones">
          {FILTER_OPTIONS.map((option) => {
            const active = filter === option.value;
            const count = counts[option.value];
            return (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={active}
                title={option.hint}
                onClick={() => onFilterChange(option.value)}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lm-sm border px-2.5 font-lm-sans text-[12.5px] font-medium transition-colors duration-150 ease-out focus-visible:lm-focus",
                  active ? "border-lm-line-strong bg-lm-raised text-lm-ink" : "border-transparent text-lm-ink-2 hover:text-lm-ink",
                )}
              >
                {option.label}
                {count ? <span className={cn("font-mono text-[11px]", active ? "text-lm-ink-2" : "text-lm-ink-3")}>{count}</span> : null}
              </button>
            );
          })}
        </div>

        {/* Las cuatro predefinidas están siempre (con su color); después, las demás que haya en la bandeja.
            Tocar la elegida la saca: no hace falta buscar una X. */}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por etiqueta">
          {tags.slice(0, 12).map(({ tag: value, count }) => {
            const view = describeTag(value, labels);
            const active = tag === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={active}
                title={active ? "Quitar el filtro" : `Ver sólo «${view.label}»`}
                onClick={() => onTagChange(active ? null : value)}
                className={cn(
                  "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-lm-xs border px-1.5 font-lm-sans text-[11.5px] transition-colors duration-150 ease-out focus-visible:lm-focus",
                  active
                    ? view.color
                      ? cn(TAG_TONE[view.color], "font-medium")
                      : "border-lm-line-strong bg-lm-ink/10 font-medium text-lm-ink"
                    : "border-lm-line text-lm-ink-2 hover:border-lm-line-strong hover:text-lm-ink",
                  tag && !active && "opacity-55 hover:opacity-100",
                )}
              >
                {view.color ? <span className={cn("size-1.5 shrink-0 rounded-full", TAG_DOT[view.color])} aria-hidden /> : null}
                {view.label}
                <span className={cn("font-mono text-[10.5px]", active ? "opacity-80" : "text-lm-ink-3")}>{count}</span>
                {active ? <X className="size-3" strokeWidth={1.5} aria-hidden /> : null}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-10 text-center text-[13px] text-lm-ink-3">{emptyHint}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain" role="listbox" aria-label="Conversaciones">
          {items.map((item) => (
            <ConversationRow
              key={item.id}
              item={item}
              active={item.id === selectedId}
              onSelect={onSelect}
              onPrefetch={onPrefetch}
              labels={labels}
              now={now}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

const ConversationRow = memo(function ConversationRow({
  item,
  active,
  onSelect,
  onPrefetch,
  labels,
  now,
}: {
  item: ConversationListItem;
  active: boolean;
  onSelect: (id: string) => void;
  onPrefetch: (id: string) => void;
  labels: Map<string, TagLabelRow>;
  now: number;
}) {
  const unread = item.unread_count > 0;
  const title = item.participant_name || (item.participant_handle ? `@${item.participant_handle}` : "Sin nombre");
  const waiting = awaitingReply(item);
  const left = waiting ? openWindowLeft(item.last_inbound_at, now) : 0;
  // Las de etapa pura (tofu, lead-calificado…) ya se leen en la marca de etapa; las predefinidas se muestran siempre.
  const tags = orderTags(item.tags ?? [], labels).filter((view) => view.color || !view.stage);
  const stage = stageOf(item.tags ?? [], labels);
  const due = followUpDue(item.follow_up_at, now);

  return (
    <li role="option" aria-selected={active}>
      <button
        type="button"
        data-conversation-id={item.id}
        onClick={() => onSelect(item.id)}
        onPointerEnter={() => onPrefetch(item.id)}
        onFocus={() => onPrefetch(item.id)}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full gap-3 border-b border-lm-line px-3 py-3 text-left transition-colors duration-150 ease-out focus-visible:lm-focus focus-visible:-outline-offset-2",
          active ? "bg-lm-raised" : "hover:bg-lm-raised/60",
        )}
      >
        <Avatar name={item.participant_name} handle={item.participant_handle} picture={item.participant_picture} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate font-lm-sans text-[13.5px] text-lm-ink", unread ? "font-semibold" : "font-medium")}>{title}</span>
            <span className="shrink-0 font-mono text-[11px] text-lm-ink-3">{formatChatTime(item.last_message_at)}</span>
          </div>
          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p className={cn("truncate text-[12.5px]", unread ? "text-lm-ink" : "text-lm-ink-2")}>{item.last_message_preview ?? "Sin mensajes"}</p>
            {unread ? (
              <span className="grid h-4.5 min-w-4.5 shrink-0 place-items-center rounded-full bg-lm-signal px-1 font-mono text-[10.5px] font-semibold text-lm-on-signal">
                {item.unread_count > 99 ? "99+" : item.unread_count}
              </span>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-lm-ink-3">
            {waiting ? (
              <span className={cn("inline-flex items-center gap-1 pr-1", left > 0 && left <= WINDOW_WARNING_MS ? "text-lm-danger" : "text-lm-ink-2")}>
                <CornerDownLeft className="size-3" strokeWidth={1.5} />
                {left > 0 ? `Te toca · quedan ${formatWindowLeft(left)}` : "Te toca"}
              </span>
            ) : null}
            {due ? (
              <span className="inline-flex items-center gap-1 pr-1 text-lm-ink-2">
                <AlarmClock className="size-3" strokeWidth={1.5} />
                Seguimiento
              </span>
            ) : null}
            {stage ? <StageMark stage={stage} /> : null}
            {tags.slice(0, 2).map((view) => (
              <TagChip key={view.tag} view={view} />
            ))}
            {tags.length > 2 ? <span className="font-mono">+{tags.length - 2}</span> : null}
            {item.lead_name ? (
              <span className="inline-flex max-w-36 items-center gap-1 truncate pl-0.5 text-lm-ink-2">
                <Link2 className="size-3 shrink-0" strokeWidth={1.5} />
                <span className="truncate">{item.lead_name}</span>
              </span>
            ) : null}
            {item.thread_owner === "other" ? <span>Otra app es dueña del hilo</span> : null}
          </div>
        </div>
      </button>
    </li>
  );
});

export function Avatar({
  name,
  handle,
  picture,
  size = "md",
}: {
  name: string | null;
  handle: string | null;
  picture: string | null;
  size?: "md" | "lg";
}) {
  const dimension = size === "lg" ? "size-10 text-sm" : "size-9 text-xs";
  const pixels = size === "lg" ? 40 : 36;
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-full border border-lm-line-strong bg-lm-surface font-lm-sans font-semibold text-lm-ink-2", dimension)}>
      {initialsOf(name, handle)}
      {picture && /^https:\/\//.test(picture) ? (
        // Foto de la CDN de Meta: expira. Si falla, quedan las iniciales de abajo.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={picture}
          alt=""
          width={pixels}
          height={pixels}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
    </span>
  );
}
