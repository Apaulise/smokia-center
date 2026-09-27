import { Table, Td, Th, Tr } from "@/components/leads/ui/table";
import { EmptyLine } from "@/components/leads/ui/feedback";
import { ANGLE_LABEL, type SalesAngle } from "@/lib/leads/ai/angles";
import type { AngleVariantPerformance } from "@/lib/leads/queries";

/**
 * Con 184 contactos repartidos en nueve ángulos, ninguna diferencia es
 * significativa (Plan §1.19) — mismo criterio que `Plans/03 §3.11` con
 * `SIN_BASELINE`: clasificar contra tres datos es fabricar evidencia.
 */
const ANGLE_MIN_SAMPLE = 20;

function formatRate(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(0)}%`;
}

/** Experimentación de aperturas por ángulo y variante (Plan §1.19, SPA §7/§27). El `n` siempre al lado de cada porcentaje. */
export function AngleExperimentsTable({ rows }: { rows: AngleVariantPerformance[] }) {
  if (rows.length === 0) {
    return (
      <EmptyLine>Todavía no hay suficientes aperturas confirmadas para comparar ángulos.</EmptyLine>
    );
  }

  const sorted = [...rows].sort((a, b) => b.n - a.n);

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <thead>
          <tr>
            <Th>Ángulo</Th>
            <Th>Variante</Th>
            <Th align="right">n</Th>
            <Th align="right">Respuesta humana</Th>
            <Th align="right">Calificación</Th>
            <Th align="right">Agenda</Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => {
            const belowSample = row.n < ANGLE_MIN_SAMPLE;
            return (
              <Tr key={`${row.angle}-${row.variant}`}>
                <Td>{ANGLE_LABEL[row.angle as SalesAngle]}</Td>
                <Td className="text-lm-ink-2">{row.variant}</Td>
                <Td numeric>{row.n}</Td>
                <Td numeric>{belowSample ? "—" : formatRate(row.human_response_rate)}</Td>
                <Td numeric>{belowSample ? "—" : formatRate(row.qualification_rate)}</Td>
                <Td numeric>{belowSample ? "—" : formatRate(row.meeting_rate)}</Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <p className="text-xs text-lm-ink-3">
        Las tasas sólo se muestran con al menos {ANGLE_MIN_SAMPLE} aperturas confirmadas (n). Por debajo, comparar es fabricar evidencia.
      </p>
    </div>
  );
}
