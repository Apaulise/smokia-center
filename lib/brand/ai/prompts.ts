import {
  BASELINE_WINDOW,
  FAILED_THRESHOLD,
  formatMultiple,
  formatObjectiveValue,
  KIND_LABEL,
  WINNER_THRESHOLD,
  type AnalysisPost,
  type BrandInsightsSummary,
  type KindBaseline,
  type PatternRow,
  type PostResult,
} from "@/lib/brand/insights";
import type { KnowledgeRow } from "@/lib/brand/knowledge/queries";
import { KNOWLEDGE_COLLECTIONS, type KnowledgeCollection } from "@/lib/brand/knowledge/schema";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const PLATFORM_LABEL: Record<BrandPlatform, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube" };

function formatRows(rows: PatternRow[]): string {
  if (rows.length === 0) return "  (sin datos suficientes todavía)";
  return rows
    .map((r) => `  - ${r.label}: ${r.displayValue} (muestra: ${r.sampleSize} post${r.sampleSize === 1 ? "" : "s"}, postIds: [${r.postIds.join(", ")}])`)
    .join("\n");
}

/** La clasificación de §3.11, con los múltiplos que la sostienen — para que el modelo la cite sin recalcularla. */
function formatResult(result: PostResult | undefined): string | null {
  if (!result) return null;
  const scores = [
    result.reach ? `alcance ${formatMultiple(result.reach.index)} la mediana` : null,
    result.authority ? `autoridad ${formatMultiple(result.authority.index)} la mediana` : null,
  ].filter(Boolean);
  return `clasificación=${result.classification}${scores.length > 0 ? ` (${scores.join(", ")})` : ""}`;
}

function formatBaselines(baselines: KindBaseline[]): string {
  if (baselines.length === 0) return "  (todavía no hay baseline: faltan piezas maduras por formato — no hay nada que clasificar)";
  return baselines
    .map((b) => {
      const parts = [
        b.reach ? `alcance ${formatObjectiveValue("ALCANCE", b.reach.median)} (n=${b.reach.sample})` : null,
        b.authority ? `autoridad ${formatObjectiveValue("AUTORIDAD", b.authority.median)} (n=${b.authority.sample})` : null,
      ].filter(Boolean);
      return `  - ${KIND_LABEL[b.kind]}: ${parts.join(" · ")}`;
    })
    .join("\n");
}

export function formatPost(post: AnalysisPost, result?: PostResult): string {
  const parts = [
    `postId=${post.postId}`,
    post.kind,
    post.caption ? `caption="${post.caption.slice(0, 140).replace(/\s+/g, " ")}"` : "sin caption",
    post.reach !== null ? `alcance=${post.reach}` : null,
    post.views !== null ? `views=${post.views}` : null,
    post.likes !== null ? `likes=${post.likes}` : null,
    post.saved !== null ? `guardados=${post.saved}` : null,
    post.reelSkipRate !== null ? `skip_rate=${post.reelSkipRate}%` : null,
    formatResult(result),
  ].filter(Boolean);
  return `  - ${parts.join(", ")}`;
}

/**
 * Datos + instrucciones de tarea para §3.5 (Plans/03 §3.10, "Ampliación del
 * SOC"). El criterio editorial —qué es un ganador, cómo leerlo, qué hacer con
 * un cluster— vive en el SOC (system prompt, lib/brand/ai/content-os.ts).
 * Esto es sólo lo que el SOC no puede saber: la forma de los datos que le
 * mandamos y el esquema de salida que espera nuestra base.
 */
export function buildRecommendationsUserPrompt(platform: BrandPlatform, insights: BrandInsightsSummary): string {
  return `Cuenta: ${PLATFORM_LABEL[platform]}
Período analizado: ${insights.periodFrom ?? "?"} a ${insights.periodTo ?? "?"} (${insights.totalPosts} posts con métricas)

## Mejor día/horario para publicar (tasa de interacción = (likes+comments+shares+guardados)/alcance)
${formatRows(insights.bestTimes)}

## Formato vs. guardados (guardados/alcance promedio por tipo de pieza)
${formatRows(insights.formatPerformance)}

## Largo del caption vs. interacción
${formatRows(insights.captionLength)}

## Hashtags que aparecen más en el contenido que mejor funcionó
${formatRows(insights.topHashtags)}

## Retención en reels (skip rate — más bajo es mejor; promedio de la cuenta: ${
    insights.retention.avgSkipRate !== null ? `${insights.retention.avgSkipRate.toFixed(1)}%` : "sin datos"
  }, watch time promedio: ${
    insights.retention.avgWatchTimeMs !== null ? `${Math.round(insights.retention.avgWatchTimeMs / 1000)}s` : "sin datos"
  })
${formatRows(insights.retention.rows)}

## Baseline propio (mediana de las últimas ${BASELINE_WINDOW} piezas maduras del mismo formato; ganador desde ${formatMultiple(WINNER_THRESHOLD)}, experimento fallido hasta ${formatMultiple(FAILED_THRESHOLD)})
${formatBaselines(insights.baselines)}

## Mejor contenido del período
${insights.topPosts.map((p) => formatPost(p, insights.results[p.postId])).join("\n") || "  (sin datos suficientes)"}

## Peor contenido del período
${insights.bottomPosts.map((p) => formatPost(p, insights.results[p.postId])).join("\n") || "  (sin datos suficientes)"}

Analizá esto siguiendo el §29 del SOC: qué sabemos, qué sospechamos, qué no sabemos todavía — y de ahí, qué duplicarías (REPETIR), qué reducirías (CORTAR) y qué testearías ahora (PROBAR). Nunca recalcules ni inventes aritmética: los números de arriba ya están bien, tu trabajo es la lectura.

La "clasificación" de cada pieza (GANADOR_ALCANCE, GANADOR_AUTORIDAD, NEUTRO, EXPERIMENTO_FALLIDO) ya está calculada contra el baseline propio: usala tal cual. SIN_BASELINE y MADURANDO significan que de esa pieza todavía no se puede afirmar nada. La conversión no se mide en este sistema: no clasifiques nada como ganador de conversión.

Reglas de esquema, no de criterio editorial:
- "knowns", "hypotheses" y "unknowns" van en markdown: una lista de viñetas (3 a 6 cada una), cada viñeta una sola oración. Esto se muestra en una card compacta, no en un informe — nada de párrafos largos ni de repetir el mismo punto con otras palabras.
- Cada recomendación lleva un "objective" (§16 del SOC): ALCANCE, AUTORIDAD o CONVERSION — para qué objetivo sirve, no todo se optimiza para lo mismo.
- Un REPETIR sobre un ganador no es "hacé más de esto": traé el cluster de variaciones concretas (hook, ángulo, ejemplo distintos — §13–14 del SOC) en el cuerpo de la recomendación.
- En "postIds" sólo pueden ir ids que aparecen en los datos de arriba. Si no tenés un post concreto para citar, dejá el array vacío.
- Los ids van únicamente en "postIds". Nunca escribas un id, ni completo ni abreviado, en "title", "body" ni "evidenceSummary": quien lee no sabe qué pieza es. Para nombrar una pieza usá las primeras palabras de su caption entre comillas, o describila por su formato ("el reel más reciente").
- Si una fila tiene sampleSize bajo (2-3 posts), decilo en el texto ("con pocos datos todavía") en vez de sonar más seguro de lo que la muestra permite.
- No repitas el mismo hallazgo en dos recomendaciones distintas.
- Producí entre 3 y 8 recomendaciones, priorizando las que tengan evidencia más fuerte.`;
}

export interface KnowledgeSnapshot {
  counts: Record<KnowledgeCollection, number>;
  openExperiments: KnowledgeRow[];
}

/**
 * La base de conocimiento vista desde el turno (§3.12): cuánto hay, qué
 * experimentos siguen abiertos, y la prioridad de evidencia del SOC §18 —
 * una nota guardada no es un hecho, y quien la escribió fue el modelo.
 * Va acá y no en el SOC porque son datos que cambian en cada turno.
 */
function formatKnowledge(knowledge: KnowledgeSnapshot): string {
  const total = Object.values(knowledge.counts).reduce((sum, n) => sum + n, 0);
  const perCollection = KNOWLEDGE_COLLECTIONS.filter((c) => knowledge.counts[c] > 0)
    .map((c) => `${c} ${knowledge.counts[c]}`)
    .join(", ");
  const experiments =
    knowledge.openExperiments
      .map((e) => `  - ${e.title} (${e.status}${e.post_id ? `, postId=${e.post_id}` : ""}, id=${e.id})`)
      .join("\n") || "  (ninguno abierto)";

  return `Base de conocimiento: ${total === 0 ? "todavía vacía" : `${total} notas (${perCollection})`}. Antes de proponer ideas consultala con buscar_conocimiento (SOC §27); lo que valga la pena recordar guardalo con guardar_conocimiento. Cada nota trae su origen y no pesa igual (SOC §18): PROPIO sale de métricas de Agus; MERCADO y HIPOTESIS son evidencia más débil y no se presentan como hechos establecidos. Una nota guardada por vos en otra conversación es una lectura de ese momento, no una verdad.
Experimentos abiertos (pendientes o activos) — si alguno ya tiene su pieza publicada y con métricas, cerralo con actualizar_conocimiento y comparalo con su hipótesis:
${experiments}`;
}

/**
 * El "bloque de estado" de §3.10: baseline, ganadores vigentes y mejores
 * piezas recientes. Viaja como mensaje `{ role: "system" }` DESPUÉS del turno
 * del usuario (no en el `system` de arriba, que se cachea) porque cambia en
 * cada turno — meterlo en el prefijo cacheado invalidaría el caché siempre.
 * Trae el baseline y la clasificación de §3.11 (SOC §16–17) más las mejores
 * piezas por interacción.
 */
export function buildContentOSStateBlock(
  platform: BrandPlatform,
  insights: BrandInsightsSummary | null,
  posts: AnalysisPost[],
  knowledge: KnowledgeSnapshot,
): string {
  const knowledgeBlock = formatKnowledge(knowledge);

  if (!insights) {
    return `Estado del sistema: todavía no hay suficiente contenido propio sincronizado con métricas. Si hace falta, usá buscar_mis_posts para ver qué hay disponible.

${knowledgeBlock}`;
  }

  const bestContent =
    insights.topPosts
      .slice(0, 5)
      .map((p) => formatPost(p, insights.results[p.postId]))
      .join("\n") || "  (sin datos suficientes)";

  const newestFirst = [...posts]
    .filter((p) => p.publishedAt !== null)
    .sort((a, b) => (b.publishedAt as string).localeCompare(a.publishedAt as string));
  const withClass = (...classes: PostResult["classification"][]) =>
    newestFirst.filter((p) => classes.includes(insights.results[p.postId]?.classification));
  const lines = (list: AnalysisPost[], take: number) =>
    list
      .slice(0, take)
      .map((p) => formatPost(p, insights.results[p.postId]))
      .join("\n") || "  (ninguno todavía)";

  const unclassified = withClass("MADURANDO", "SIN_BASELINE");

  return `Estado del sistema (se recalcula en cada turno, no forma parte del prompt cacheado):
Cuenta: ${PLATFORM_LABEL[platform]}
Período con métricas: ${insights.periodFrom ?? "?"} a ${insights.periodTo ?? "?"} (${insights.totalPosts} posts)

Baseline propio (SOC §16) — mediana de las últimas ${BASELINE_WINDOW} piezas maduras del mismo formato. Ganador desde ${formatMultiple(WINNER_THRESHOLD)}, experimento fallido hasta ${formatMultiple(FAILED_THRESHOLD)}:
${formatBaselines(insights.baselines)}

Clasificación (SOC §17) — calculada contra ese baseline, no es una opinión. Si una pieza no figura acá es que todavía no se puede afirmar nada de ella (${unclassified.length} sin clasificar: recién publicadas o sin muestra suficiente en su formato):
Ganadores más recientes:
${lines(withClass("GANADOR_ALCANCE", "GANADOR_AUTORIDAD"), 5)}
Experimentos fallidos más recientes (SOC §17: no son tiempo perdido, sirven para no repetir el error):
${lines(withClass("EXPERIMENTO_FALLIDO"), 3)}

Contenido propio que mejor funcionó últimamente por interacción (para fundar una idea o inspirarte en qué repetir — nunca copiar literal):
${bestContent}

${knowledgeBlock}`;
}
