import { X } from "lucide-react";

import type { FunnelStage } from "@/lib/chats/db";
import type { TagView } from "@/lib/chats/tag-view";
import { cn } from "@/lib/utils";

/**
 * Una etiqueta de Zernio. Neutra por defecto: el color no se gasta en
 * etiquetas (CLAUDE.md §6). La etapa del embudo va aparte, en `StageMark`.
 */
export function TagChip({ view, onRemove, className }: { view: TagView; onRemove?: () => void; className?: string }) {
  return (
    <span
      title={view.tag}
      className={cn(
        "inline-flex h-5 max-w-40 items-center gap-1 rounded-lm-xs border border-lm-line bg-lm-surface px-1.5 font-lm-sans text-[11px] text-lm-ink-2",
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
          className="-mr-0.5 grid size-3.5 place-items-center rounded-lm-xs text-lm-ink-3 hover:bg-lm-raised hover:text-lm-ink focus-visible:lm-focus"
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

/** La etapa del embudo, en mono. Sólo BOFU (lo más cerca de la venta) se marca con el amarillo de dato. */
export function StageMark({ stage, className }: { stage: FunnelStage; className?: string }) {
  return (
    <span
      title={STAGE_TITLE[stage]}
      className={cn(
        "inline-flex h-5 items-center rounded-lm-xs px-1.5 font-mono text-[10.5px] font-semibold tracking-[0.04em]",
        stage === "BOFU" ? "bg-lm-signal-soft text-lm-signal-text" : "bg-lm-raised text-lm-ink-2",
        className,
      )}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
