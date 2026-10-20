import { SaveSignalButton } from "@/components/leads/copilot/save-signal-button";
import { CopilotLabel } from "@/components/leads/ui/copilot";
import { EmptyLine } from "@/components/leads/ui/feedback";
import type { LeadSignalRow } from "@/lib/leads/queries";

const STATUS_LABEL: Record<LeadSignalRow["status"], string> = {
  HIPOTESIS: "Hipótesis",
  SOSPECHADO: "Sospechado",
  CONFIRMADO: "Confirmado",
};

/**
 * Dolores, objeciones y señales de compra del lead (Plan §1.13/§1.15, Design
 * System Copilot): filas agrupadas por tipo (el título puede ser largo: la columna es angosta y un chip de alto fijo lo cortaba). El estado persistido, no un
 * resultado transitorio de la última corrida del analizador. `CONFIRMADO`
 * siempre trae una cita (§1.13) — sin ella no llega, por eso se usa como
 * tooltip de evidencia en vez de mostrarla siempre expandida.
 */
export function SignalsList({ leadId, signals }: { leadId: string; signals: LeadSignalRow[] }) {
  if (signals.length === 0) {
    return <EmptyLine>Todavía no hay dolores, objeciones ni señales de compra registrados.</EmptyLine>;
  }

  const sorted = [...signals].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const groups: { label: string; items: LeadSignalRow[] }[] = [
    { label: "Dolores", items: sorted.filter((s) => s.kind === "DOLOR") },
    { label: "Objeciones", items: sorted.filter((s) => s.kind === "OBJECION") },
    { label: "Señales de compra", items: sorted.filter((s) => s.kind === "SENAL_COMPRA") },
  ];

  return (
    <div className="flex flex-col gap-5">
      {groups
        .filter((group) => group.items.length > 0)
        .map((group) => (
          <div key={group.label} className="flex flex-col gap-2">
            <CopilotLabel>{group.label}</CopilotLabel>
            <ul className="flex flex-col gap-3">
              {group.items.map((signal) => (
                <li key={signal.id} className="flex flex-col gap-1 border-l-2 border-lm-line-strong pl-3">
                  <p className="text-sm leading-5 text-lm-ink">{signal.title}</p>
                  <p className="text-xs text-lm-ink-3">
                    {STATUS_LABEL[signal.status]}
                    {signal.kind === "OBJECION" && signal.already_solved ? " · ya resuelto" : ""}
                  </p>
                  {signal.description ? <p className="text-xs leading-4 text-lm-ink-2">{signal.description}</p> : null}
                  {signal.evidence ? (
                    <p className="text-xs leading-4 text-lm-ink-3 italic">“{signal.evidence}”</p>
                  ) : null}
                  {/* Sólo lo confirmado o sospechado se puede guardar en memoria global (§1.13). */}
                  {signal.status !== "HIPOTESIS" ? (
                    <div className="mt-1">
                      <SaveSignalButton leadId={leadId} signal={signal} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ))}
    </div>
  );
}
