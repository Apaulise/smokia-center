import { X } from "lucide-react";

import type { FunnelStage } from "@/lib/chats/db";
import type { TagView } from "@/lib/chats/tag-view";
import { cn } from "@/lib/utils";

/**
 * Los tres colores del embudo (decisión del dueño, 2026-11-16): se reusan los
 * tokens semánticos que ya existen (nunca un hex suelto, CLAUDE.md §6) — el
 * amarillo de dato queda para BOFU, lo más cerca de la venta; TOFU y MOFU usan
 * `info` y `success`, que ya son parte del sistema. Una etiqueta sin etapa
 * (negocio, curioso, una palabra clave) sigue neutra: el color no se gasta de más.
 */
const STAGE_TONE: Record<FunnelStage, string> = {
  TOFU: "border-transparent bg-lm-info/15 text-lm-info",
  MOFU: "border-transparent bg-lm-success-soft text-lm-success",
  BOFU: "border-transparent bg-lm-signal-soft text-lm-signal-text",
};

/** Una etiqueta de Zernio. Coloreada por etapa del embudo si la tiene; si no, neutra. */
export function TagChip({ view, onRemove, className }: { view: TagView; onRemove?: () => void; className?: string }) {
  return (
    <span
      title={view.tag}
      className={cn(
        "inline-flex h-5 max-w-40 items-center gap-1 rounded-lm-xs border px-1.5 font-lm-sans text-[11px] font-medium",
        view.stage ? STAGE_TONE[view.stage] : "border-lm-line bg-lm-surface text-lm-ink-2 font-normal",
        view.keyword && "border-dashed",
        className,
      )}
    >
      <span className="truncate">{view.label}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Sacar la etiqueta ${view.label}`}
          className="-mr-0.5 grid size-3.5 place-items-center rounded-lm-xs opacity-70 hover:bg-lm-overlay hover:opacity-100 focus-visible:lm-focus"
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

/** La etapa del embudo, en mono, con el color de su etapa (ver `STAGE_TONE`). */
export function StageMark({ stage, className }: { stage: FunnelStage; className?: string }) {
  return (
    <span
      title={STAGE_TITLE[stage]}
      className={cn("inline-flex h-5 items-center rounded-lm-xs px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.04em]", STAGE_TONE[stage], className)}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
