import { X } from "lucide-react";

import type { FunnelStage } from "@/lib/chats/db";
import type { TagColor, TagView } from "@/lib/chats/tag-view";
import { cn } from "@/lib/utils";

/**
 * Los cuatro colores de las etiquetas predefinidas (decisión del dueño,
 * 2026-11-16): Agenda verde, Negocio azul, Curioso rojo, Seguimiento amarillo.
 * Salen de tokens (`lm-tag-*` y `signal`, nunca un hex suelto, CLAUDE.md §6) y
 * son el único código de color de la bandeja: cualquier otra etiqueta va
 * neutra y la etapa del embudo se marca en mono, sin color, para que dos
 * códigos de color no compitan en la misma fila.
 */
export const TAG_TONE: Record<TagColor, string> = {
  green: "border-transparent bg-lm-tag-green/15 text-lm-tag-green",
  blue: "border-transparent bg-lm-tag-blue/15 text-lm-tag-blue",
  red: "border-transparent bg-lm-tag-red/15 text-lm-tag-red",
  yellow: "border-transparent bg-lm-signal-soft text-lm-signal-text",
};

/** El punto de color que acompaña al nombre: el color nunca va solo. */
export const TAG_DOT: Record<TagColor, string> = {
  green: "bg-lm-tag-green",
  blue: "bg-lm-tag-blue",
  red: "bg-lm-tag-red",
  yellow: "bg-lm-signal",
};

/** Una etiqueta de Zernio. Con su color si es una de las cuatro predefinidas; si no, neutra. */
export function TagChip({ view, onRemove, className }: { view: TagView; onRemove?: () => void; className?: string }) {
  return (
    <span
      title={view.tag}
      className={cn(
        "inline-flex h-5 max-w-40 items-center gap-1 rounded-lm-xs border px-1.5 font-lm-sans text-[11px] font-medium",
        view.color ? TAG_TONE[view.color] : "border-lm-line bg-lm-ink/5 font-normal text-lm-ink-2",
        view.keyword && "border-dashed",
        className,
      )}
    >
      {view.color ? <span className={cn("size-1.5 shrink-0 rounded-full", TAG_DOT[view.color])} aria-hidden /> : null}
      <span className="truncate">{view.label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Sacar la etiqueta ${view.label}`}
          className="-mr-0.5 grid size-3.5 place-items-center rounded-full opacity-70 hover:bg-lm-ink/15 hover:opacity-100 focus-visible:lm-focus"
        >
          <X className="size-3" strokeWidth={1.5} />
        </button>
      ) : null}
    </span>
  );
}

const STAGE_LABEL: Record<FunnelStage, string> = { TOFU: "TOFU", MOFU: "MOFU", BOFU: "BOFU" };
const STAGE_TITLE: Record<FunnelStage, string> = {
  TOFU: "Arriba del embudo: llegó por contenido de alcance",
  MOFU: "Mitad del embudo: ya mostró interés",
  BOFU: "Fondo del embudo: calificado para vender",
};

/** La etapa del embudo, en mono y sin color: el color queda para las etiquetas predefinidas. */
export function StageMark({ stage, className }: { stage: FunnelStage; className?: string }) {
  return (
    <span
      title={STAGE_TITLE[stage]}
      className={cn(
        "inline-flex h-5 items-center rounded-lm-xs border border-lm-line-strong px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.04em] text-lm-ink-2",
        className,
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
