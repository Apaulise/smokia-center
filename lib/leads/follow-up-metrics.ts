import { createClient } from "@/lib/supabase/server";

/**
 * ¿Sirven los seguimientos? Cada seguimiento confirmado (`kind = SEGUIMIENTO`)
 * se mide contra lo que pasó en ese lead *después* y *antes del siguiente
 * seguimiento*, así un resultado no se le cuenta a dos mensajes.
 *
 * - Respondió: hay un mensaje del prospecto en esa ventana. Se distingue la
 *   respuesta humana de una autorespuesta (según el análisis, si lo hay).
 * - Agendó: pasó a un estado de reunión o se cargó un turno en la ventana.
 * - Cerró: pasó a CERRADO_GANADO en la ventana.
 *
 * Es correlación, no causalidad: no dice que el seguimiento causó la reunión,
 * sino que ocurrió después de él.
 */

const MEETING_STATUSES = ["REUNION_AGENDADA", "REUNION_REALIZADA", "PROPUESTA_ENVIADA", "CERRADO_GANADO"];

export interface FollowUpBucket {
  sent: number;
  responded: number;
  /** De las respuestas, las que no son autorespuesta (o no se analizaron). */
  humanResponded: number;
  booked: number;
  won: number;
}

export interface FollowUpMetrics {
  total: FollowUpBucket;
  /** Seguimiento 1º, 2º y 3º o más — el lugar donde se ve si insistir vale la pena. */
  byStep: { step: 1 | 2 | 3; label: string; bucket: FollowUpBucket }[];
  /** Leads distintos que recibieron al menos un seguimiento, y cuántos terminaron respondiendo. */
  leads: { followedUp: number; responded: number };
  /** Mediana de días entre el seguimiento y la respuesta; `null` si nadie respondió. */
  medianDaysToReply: number | null;
}

const emptyBucket = (): FollowUpBucket => ({ sent: 0, responded: 0, humanResponded: 0, booked: 0, won: 0 });

function emptyMetrics(): FollowUpMetrics {
  return {
    total: emptyBucket(),
    byStep: [
      { step: 1, label: "1.º seguimiento", bucket: emptyBucket() },
      { step: 2, label: "2.º seguimiento", bucket: emptyBucket() },
      { step: 3, label: "3.º o más", bucket: emptyBucket() },
    ],
    leads: { followedUp: 0, responded: 0 },
    medianDaysToReply: null,
  };
}

function groupByLead<T extends { lead_id: string | null }>(rows: T[] | null): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows ?? []) {
    if (!row.lead_id) continue;
    const list = map.get(row.lead_id);
    if (list) list.push(row);
    else map.set(row.lead_id, [row]);
  }
  return map;
}

const ts = (iso: string) => new Date(iso).getTime();

function isAutoReply(analysis: unknown): boolean {
  return (analysis as { analysis?: { response_type?: string } } | null)?.analysis?.response_type === "AUTORESPUESTA";
}

export async function getFollowUpMetrics(): Promise<FollowUpMetrics> {
  const supabase = await createClient();

  const { data: followUps, error } = await supabase
    .from("lead_messages")
    .select("lead_id, occurred_at")
    .eq("sender", "VENDEDOR")
    .eq("kind", "SEGUIMIENTO")
    .eq("confirmed", true)
    .order("occurred_at", { ascending: true });
  if (error) throw error;

  const result = emptyMetrics();
  if (!followUps || followUps.length === 0) return result;

  const leadIds = [...new Set(followUps.map((f) => f.lead_id))];

  const [replies, activities, appointments] = await Promise.all([
    supabase.from("lead_messages").select("lead_id, occurred_at, analysis").eq("sender", "LEAD").in("lead_id", leadIds),
    supabase.from("lead_activities").select("lead_id, occurred_at, to_status").eq("type", "CAMBIO_ESTADO").in("lead_id", leadIds),
    supabase.from("appointments").select("lead_id, created_at").in("lead_id", leadIds),
  ]);
  if (replies.error) throw replies.error;
  if (activities.error) throw activities.error;
  if (appointments.error) throw appointments.error;

  const repliesByLead = groupByLead(replies.data);
  const activitiesByLead = groupByLead(activities.data);
  const appointmentsByLead = groupByLead(appointments.data);
  const followUpsByLead = groupByLead(followUps);

  const respondedLeads = new Set<string>();
  const replyDelays: number[] = [];

  for (const [leadId, sent] of followUpsByLead) {
    sent.forEach((follow, index) => {
      const from = ts(follow.occurred_at);
      const to = index + 1 < sent.length ? ts(sent[index + 1].occurred_at) : Infinity;
      const inWindow = (iso: string) => ts(iso) > from && ts(iso) < to;

      const reply = (repliesByLead.get(leadId) ?? []).filter((r) => inWindow(r.occurred_at));
      const humanReply = reply.some((r) => !isAutoReply(r.analysis));
      const acts = (activitiesByLead.get(leadId) ?? []).filter((a) => inWindow(a.occurred_at));
      const booked =
        acts.some((a) => a.to_status !== null && MEETING_STATUSES.includes(a.to_status)) ||
        (appointmentsByLead.get(leadId) ?? []).some((a) => inWindow(a.created_at));
      const won = acts.some((a) => a.to_status === "CERRADO_GANADO");

      const stepIndex = Math.min(index, 2);
      for (const bucket of [result.total, result.byStep[stepIndex].bucket]) {
        bucket.sent += 1;
        if (reply.length > 0) bucket.responded += 1;
        if (humanReply && reply.length > 0) bucket.humanResponded += 1;
        if (booked) bucket.booked += 1;
        if (won) bucket.won += 1;
      }
      if (reply.length > 0) {
        respondedLeads.add(leadId);
        const first = Math.min(...reply.map((r) => ts(r.occurred_at)));
        replyDelays.push((first - from) / 86_400_000);
      }
    });
  }

  result.leads = { followedUp: followUpsByLead.size, responded: respondedLeads.size };
  if (replyDelays.length > 0) {
    const sorted = [...replyDelays].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    result.medianDaysToReply = Math.round(median * 10) / 10;
  }
  return result;
}
