import type { BrandPostKind } from "@/lib/brand/sources/types";

import type { Cadence, CompetitorInsights, FormatMix, GroupBaseline, SignalGroup } from "./insights";
import { GROUP_SIGNAL_LABEL, groupOf } from "./insights";

const numberFormat = new Intl.NumberFormat("es-AR");
const oneDecimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const percentFormat = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 0 });

export function formatCount(value: number | null): string {
  return value === null ? "—" : numberFormat.format(Math.round(value));
}

const KIND_PLURAL: Record<BrandPostKind, string> = {
  REEL: "Reels",
  POST: "Posts",
  CARRUSEL: "Carruseles",
  HISTORIA: "Historias",
  VIDEO: "Videos",
  SHORT: "Shorts",
};

/** "Reels 60% · Posts 30% · Carruseles 10%", de mayor a menor. */
export function formatMix(mix: FormatMix): string {
  const total = Object.values(mix).reduce((sum, n) => sum + (n ?? 0), 0);
  if (total === 0) return "—";
  return (Object.entries(mix) as [BrandPostKind, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${KIND_PLURAL[kind]} ${percentFormat.format(count / total)}`)
    .join(" · ");
}

/** "2,3 por semana" — o el motivo por el que no se puede decir. */
export function formatCadence(cadence: Cadence): string {
  if (cadence.perWeek === null) return "Sin datos suficientes";
  return `${oneDecimal.format(cadence.perWeek)} por semana`;
}

/** Sobre cuántos días se midió, para que una cadencia calculada sobre pocos días no parezca más firme de lo que es. */
export function formatCadenceBasis(cadence: Cadence): string | null {
  if (cadence.perWeek === null) return null;
  return `${cadence.count} publicaciones en ${Math.round(cadence.spanDays)} ${Math.round(cadence.spanDays) === 1 ? "día" : "días"}`;
}

/**
 * "12.300 views (n=24)" por grupo con baseline; el grupo que tiene
 * publicaciones pero pocas para una mediana lo dice en vez de omitirse en
 * silencio. Un grupo que la cuenta no usa no se menciona.
 */
export function formatBaselines(insights: Pick<CompetitorInsights, "baselines" | "mix">): string {
  const present = (group: SignalGroup) =>
    (Object.keys(insights.mix) as BrandPostKind[]).some((kind) => groupOf(kind) === group);

  const parts = (["VIDEO", "IMAGEN"] as SignalGroup[])
    .filter(present)
    .map((group) => {
      const baseline: GroupBaseline | undefined = insights.baselines[group];
      const label = GROUP_SIGNAL_LABEL[group];
      return baseline
        ? `${numberFormat.format(Math.round(baseline.median))} ${label} (n=${baseline.sample})`
        : `sin baseline de ${label}`;
    });
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/** Sólo el número de la cadencia ("6,3"), para mostrarlo en Mono con "/ sem" aparte. `null` si no hay datos suficientes. */
export function formatCadenceValue(cadence: Cadence): string | null {
  return cadence.perWeek === null ? null : oneDecimal.format(cadence.perWeek);
}

/** Los formatos con su porcentaje, de mayor a menor — para la barra segmentada de la mezcla. */
export function mixSegments(mix: FormatMix): { kind: BrandPostKind; label: string; count: number; percent: number }[] {
  const total = Object.values(mix).reduce((sum, n) => sum + (n ?? 0), 0);
  if (total === 0) return [];
  return (Object.entries(mix) as [BrandPostKind, number][])
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => ({ kind, label: KIND_PLURAL[kind], count, percent: (count / total) * 100 }));
}
