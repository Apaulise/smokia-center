import { SaveSignalButton } from "@/components/leads/copilot/save-signal-button";
import { CopilotChip, CopilotLabel } from "@/components/leads/ui/copilot";
import { EmptyLine } from "@/components/leads/ui/feedback";
import type { LeadSignalRow } from "@/lib/leads/queries";

const STATUS_LABEL: Record<LeadSignalRow["status"], string> = {
  HIPOTESIS: "Hipótesis",
  SOSPECHADO: "Sospechado",
  CONFIRMADO: "Confirmado",
};

/**
 * Dolores, objeciones y señales de compra del lead (Plan §1.13/§1.15, Design
 * System Copilot): chips agrupados por tipo. El estado persistido, no un
 * resultado transitorio de la última corrida del analizador. `CONFIRMADO`
 * siempre trae una cita (§1.13) — sin ella no llega, por eso se usa como
 * tooltip de evidencia en vez de mostrarla siempre expandida.
 */
export function SignalsList({ leadId, signals }: { leadId: string; signals: LeadSignalRow[] }) {
  if (signals.length === 0) {
    return <EmptyLine>Todavía no hay dolores, objeciones ni señales de compra registrados.</EmptyLine>;
  }

  const sorted = [...signals].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  const pains = sorted.filter((s) => s.kind === "DOLOR");
  const objections = sorted.filter((s) => s.kind === "OBJECION");
  const buyingSignals = sorted.filter((s) => s.kind === "SENAL_COMPRA");

  function tooltipFor(signal: LeadSignalRow) {
    const parts = [signal.evidence ? `“${signal.evidence}”` : null, signal.description].filter(Boolean);
    return parts.length > 0 ? parts.join(" — ") : undefined;
  }

  return (
    <div className="flex flex-col gap-4">
      {pains.length > 0 ? (
        <div className="flex flex-col gap-2">
          <CopilotLabel>Dolores</CopilotLabel>
          <div className="flex flex-wrap gap-1.5">
            {pains.map((signal) => (
              <CopilotChip key={signal.id} variant="pain" title={tooltipFor(signal)}>
                {signal.title} · {STATUS_LABEL[signal.status]}
              </CopilotChip>
            ))}
          </div>
        </div>
      ) : null}

      {objections.length > 0 ? (
        <div className="flex flex-col gap-2">
          <CopilotLabel>Objeciones</CopilotLabel>
          <div className="flex flex-wrap gap-1.5">
            {objections.map((signal) => (
              <CopilotChip key={signal.id} variant="objection" title={tooltipFor(signal)}>
                {signal.title}
                {signal.already_solved ? " · ya resuelto" : ""}
              </CopilotChip>
            ))}
          </div>
        </div>
      ) : null}

      {buyingSignals.length > 0 ? (
        <div className="flex flex-col gap-2">
          <CopilotLabel>Señales de compra</CopilotLabel>
          <div className="flex flex-wrap gap-1.5">
            {buyingSignals.map((signal) => (
              <CopilotChip key={signal.id} variant="signal" title={tooltipFor(signal)}>
                {signal.title}
              </CopilotChip>
            ))}
          </div>
        </div>
      ) : null}

      {/* Sólo lo confirmado se puede guardar en memoria global (§1.13). */}
      <div className="flex flex-col gap-2">
        {sorted
          .filter((signal) => signal.status !== "HIPOTESIS")
          .slice(0, 3)
          .map((signal) => (
            <SaveSignalButton key={signal.id} leadId={leadId} signal={signal} />
          ))}
      </div>
    </div>
  );
}
