import type { ProspectingFunnel } from "@/lib/leads/queries";

/**
 * Las tasas del SPA §20, calculadas en TypeScript a partir de los conteos que
 * ya trajo el RPC (Plan §1.17) — la aritmética de porcentajes no necesita
 * volver a la base. `null` cuando el denominador es 0, para no mostrar un
 * falso 0%.
 */
export interface ProspectingStage {
  key: string;
  label: string;
  count: number;
  /** Tasa contra el escalón anterior, null si no aplica. */
  rateFromPrevious: number | null;
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return numerator / denominator;
}

export function buildProspectingStages(funnel: ProspectingFunnel): ProspectingStage[] {
  return [
    { key: "total_leads", label: "Leads totales", count: funnel.total_leads, rateFromPrevious: null },
    { key: "contacts_sent", label: "Contactados", count: funnel.contacts_sent, rateFromPrevious: rate(funnel.contacts_sent, funnel.total_leads) },
    {
      key: "human_responses",
      label: "Respondieron (humano)",
      count: funnel.human_responses,
      rateFromPrevious: rate(funnel.human_responses, funnel.contacts_sent),
    },
    { key: "qualified", label: "Calificados", count: funnel.qualified, rateFromPrevious: rate(funnel.qualified, funnel.human_responses) },
    { key: "interested", label: "Interesados", count: funnel.interested, rateFromPrevious: rate(funnel.interested, funnel.qualified) },
    { key: "meetings", label: "Con reunión", count: funnel.meetings, rateFromPrevious: rate(funnel.meetings, funnel.interested) },
    { key: "won", label: "Cerrados ganados", count: funnel.won, rateFromPrevious: rate(funnel.won, funnel.meetings) },
  ];
}

/**
 * Los escalones como los dibuja `<Pipeline>`: etiquetas cortas y, desde las
 * respuestas humanas en adelante (README "Estados del pipeline"), en caliente.
 * Lo usan el dashboard personal y el de equipo (Plan §1.23).
 */
export function toPipelineStages(stages: ProspectingStage[]) {
  const hotFrom = 2;
  return stages.map((stage, index) => ({
    label: stage.label.replace(" (humano)", "").replace("Leads totales", "Leads").replace("Cerrados ganados", "Ganados"),
    value: stage.count,
    conversion: stage.rateFromPrevious === null ? null : Math.round(stage.rateFromPrevious * 100),
    hot: index >= hotFrom,
  }));
}

/** Tasa de respuesta total (SPA §20): mezcla autorespuestas, se muestra aparte y marcada como no evaluativa. */
export function totalResponseRate(funnel: ProspectingFunnel): number | null {
  return rate(funnel.total_responses, funnel.contacts_sent);
}
