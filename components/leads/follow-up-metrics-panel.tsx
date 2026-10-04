import { EmptyLine } from "@/components/leads/ui/feedback";
import { Kpi, KpiRow } from "@/components/leads/ui/kpi-row";
import { Section } from "@/components/leads/ui/section";
import { Table, Td, Th, Tr } from "@/components/leads/ui/table";
import type { FollowUpBucket, FollowUpMetrics } from "@/lib/leads/follow-up-metrics";

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)} %` : "—");

function Cell({ n, d }: { n: number; d: number }) {
  return (
    <Td numeric>
      {n} <span className="text-xs text-lm-ink-3">({pct(n, d)})</span>
    </Td>
  );
}

function BucketRow({ label, bucket }: { label: string; bucket: FollowUpBucket }) {
  return (
    <Tr>
      <Td>{label}</Td>
      <Td numeric>{bucket.sent}</Td>
      <Cell n={bucket.responded} d={bucket.sent} />
      <Cell n={bucket.booked} d={bucket.sent} />
      <Cell n={bucket.won} d={bucket.sent} />
    </Tr>
  );
}

/** ¿Los seguimientos sirven? Enviados → respondieron → agendaron → cerraron, y por número de intento. */
export function FollowUpMetricsPanel({ metrics }: { metrics: FollowUpMetrics }) {
  const { total, byStep, leads, medianDaysToReply } = metrics;
  const autoReplies = total.responded - total.humanResponded;

  return (
    <Section
      eyebrow="RESULTADOS"
      title="¿Los seguimientos están sirviendo?"
      description="Cada seguimiento confirmado, medido contra lo que pasó en ese lead después y antes del siguiente seguimiento."
    >
      {total.sent === 0 ? (
        <EmptyLine>Todavía no confirmaste ningún seguimiento. Cuando generes uno y apretes «Ya lo mandé», acá vas a ver si funciona.</EmptyLine>
      ) : (
        <>
          <KpiRow>
            <Kpi label="Enviados" value={total.sent} delta={`a ${leads.followedUp} leads`} />
            <Kpi
              label="Respondieron"
              signal
              value={total.responded}
              delta={`${pct(total.responded, total.sent)} · ${pct(leads.responded, leads.followedUp)} de los leads`}
              muted={total.responded === 0}
            />
            <Kpi label="Agendaron" value={total.booked} delta={pct(total.booked, total.sent)} muted={total.booked === 0} />
            <Kpi label="Cerraron" value={total.won} delta={pct(total.won, total.sent)} muted={total.won === 0} />
            <Kpi
              label="Tardan en responder"
              value={medianDaysToReply !== null ? `${medianDaysToReply} d` : "—"}
              delta="mediana"
              muted={medianDaysToReply === null}
            />
          </KpiRow>

          <Table>
            <thead>
              <tr>
                <Th>Intento</Th>
                <Th align="right">Enviados</Th>
                <Th align="right">Respondieron</Th>
                <Th align="right">Agendaron</Th>
                <Th align="right">Cerraron</Th>
              </tr>
            </thead>
            <tbody>
              {byStep.map((s) => (
                <BucketRow key={s.step} label={s.label} bucket={s.bucket} />
              ))}
            </tbody>
          </Table>

          <p className="text-xs text-lm-ink-3">
            Mide lo que pasó después, no lo que causó el seguimiento. Con pocos envíos los porcentajes se mueven mucho: mirá el número de al lado.
            {autoReplies > 0 ? ` ${autoReplies} de las respuestas fueron autorespuestas.` : ""}
          </p>
        </>
      )}
    </Section>
  );
}
