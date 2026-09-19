import type { AnalysisPost, BrandInsightsSummary, PatternRow } from "@/lib/brand/insights";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const PLATFORM_LABEL: Record<BrandPlatform, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube" };

function formatRows(rows: PatternRow[]): string {
  if (rows.length === 0) return "  (sin datos suficientes todavía)";
  return rows
    .map((r) => `  - ${r.label}: ${r.displayValue} (muestra: ${r.sampleSize} post${r.sampleSize === 1 ? "" : "s"}, postIds: [${r.postIds.join(", ")}])`)
    .join("\n");
}

export function formatPost(post: AnalysisPost): string {
  const parts = [
    `postId=${post.postId}`,
    post.kind,
    post.caption ? `caption="${post.caption.slice(0, 140).replace(/\s+/g, " ")}"` : "sin caption",
    post.reach !== null ? `alcance=${post.reach}` : null,
    post.views !== null ? `views=${post.views}` : null,
    post.likes !== null ? `likes=${post.likes}` : null,
    post.saved !== null ? `guardados=${post.saved}` : null,
    post.reelSkipRate !== null ? `skip_rate=${post.reelSkipRate}%` : null,
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

## Mejor contenido del período
${insights.topPosts.map(formatPost).join("\n") || "  (sin datos suficientes)"}

## Peor contenido del período
${insights.bottomPosts.map(formatPost).join("\n") || "  (sin datos suficientes)"}

Analizá esto siguiendo el §29 del SOC: qué sabemos, qué sospechamos, qué no sabemos todavía — y de ahí, qué duplicarías (REPETIR), qué reducirías (CORTAR) y qué testearías ahora (PROBAR). Nunca recalcules ni inventes aritmética: los números de arriba ya están bien, tu trabajo es la lectura.

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

/**
 * El "bloque de estado" de §3.10: baseline, ganadores vigentes y mejores
 * piezas recientes. Viaja como mensaje `{ role: "system" }` DESPUÉS del turno
 * del usuario (no en el `system` de arriba, que se cachea) porque cambia en
 * cada turno — meterlo en el prefijo cacheado invalidaría el caché siempre.
 * Mientras §3.11 no exista, se arma con lo que ya hay: totales del período y
 * mejores piezas.
 */
export function buildContentOSStateBlock(platform: BrandPlatform, insights: BrandInsightsSummary | null): string {
  if (!insights) {
    return "Estado del sistema: todavía no hay suficiente contenido propio sincronizado con métricas. Si hace falta, usá buscar_mis_posts para ver qué hay disponible.";
  }

  const bestContent = insights.topPosts.slice(0, 5).map(formatPost).join("\n") || "  (sin datos suficientes)";

  return `Estado del sistema (se recalcula en cada turno, no forma parte del prompt cacheado):
Cuenta: ${PLATFORM_LABEL[platform]}
Período con métricas: ${insights.periodFrom ?? "?"} a ${insights.periodTo ?? "?"} (${insights.totalPosts} posts)

Contenido propio que mejor funcionó últimamente (para fundar una idea o inspirarte en qué repetir — nunca copiar literal):
${bestContent}`;
}
