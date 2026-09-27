import { CopilotScore } from "@/components/leads/ui/copilot";
import type { LeadMemory } from "@/lib/leads/ai/prompts";
import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type LeadNextAction = Database["public"]["Enums"]["lead_next_action"];

const NEXT_ACTION_LABEL: Record<LeadNextAction, string> = {
  ASK_QUESTION: "Seguir preguntando",
  EXPLAIN_SERVICE: "Explicar quién sos",
  ASK_FOR_MEETING: "Pedir la reunión",
  SEND_INFORMATION: "Mandar información",
  FOLLOW_UP: "Seguimiento futuro",
  WAIT: "Esperar",
  DISQUALIFY: "Descartar",
  CLOSE_LEAD: "Avanzar a cierre",
};

/** Diez ticks (Design System Copilot): el puntaje de interés se lee de un vistazo, no sólo por el número. */
function InterestTicks({ level }: { level: number | null }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 10 }).map((_, index) => (
        <span
          key={index}
          className={cn("h-1.5 flex-1 rounded-lm-xs", level !== null && index < level ? "bg-lm-signal" : "bg-lm-smoke-1")}
        />
      ))}
    </div>
  );
}

/**
 * La cabecera del copiloto (Plan §1.15, SPA §22): interés · próxima acción
 * recomendada. Todo derivado o persistido — nada se calcula acá.
 */
export function StatusSummary({
  interestLevel,
  nextBestAction,
  nextBestActionReason,
  memory,
}: {
  interestLevel: number | null;
  nextBestAction: LeadNextAction | null;
  nextBestActionReason: string | null;
  memory: LeadMemory | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <CopilotScore value={interestLevel ?? 0} />
      <InterestTicks level={interestLevel} />

      {nextBestAction ? (
        <div className="mt-1">
          <p className="mb-1 text-xs text-lm-ink-3">Próxima acción recomendada</p>
          <p className="text-lm-ink">{NEXT_ACTION_LABEL[nextBestAction]}</p>
          {nextBestActionReason ? <p className="mt-0.5 text-xs text-lm-ink-3">{nextBestActionReason}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-lm-ink-3">Todavía no se analizó ninguna respuesta.</p>
      )}

      {memory?.timing ? (
        <div>
          <p className="mb-1 text-xs text-lm-ink-3">Timing</p>
          <p className="text-lm-ink">{memory.timing}</p>
        </div>
      ) : null}
    </div>
  );
}
