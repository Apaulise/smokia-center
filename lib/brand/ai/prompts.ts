import type { AnalysisPost, BrandInsightsSummary, PatternRow } from "@/lib/brand/insights";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const PLATFORM_LABEL: Record<BrandPlatform, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube" };

export function buildRecommendationsSystemPrompt(): string {
  return `Sos el analista de contenido del Gestor de Marca Personal de Awareness AI.

Tu trabajo es leer patrones YA CALCULADOS sobre el contenido de una cuenta y traducirlos en recomendaciones concretas — nunca recalcules ni inventes aritmética, los números que te pasan ya están bien.

Reglas no negociables:
- Cada recomendación cita evidencia real: en "postIds" sólo pueden ir ids que aparecen en los datos que te paso. Si no tenés un post concreto para citar, dejá el array vacío.
- Si una fila tiene sampleSize bajo (2-3 posts), decilo en el texto ("con pocos datos todavía", "a confirmar con más contenido") en vez de sonar más seguro de lo que la muestra permite.
- Los ids van únicamente en "postIds". Nunca escribas un id, ni completo ni abreviado (por ejemplo "Reel 11a441dc"), en "title", "body" ni "evidenceSummary": quien lee no sabe qué pieza es. Para nombrar una pieza en el texto usá las primeras palabras de su caption entre comillas, o describila por su formato ("el reel más reciente") si no tiene caption.
- No repitas el mismo hallazgo en dos recomendaciones distintas.
- Escribí en español rioplatense, tono profesional y directo, sin relleno motivacional.
- Cada recomendación es "REPETIR" (algo que ya funciona y conviene sostener), "CORTAR" (algo que está rindiendo mal y conviene dejar de hacer) o "PROBAR" (una idea nueva fundada en un hueco o patrón que los datos muestran).
- Producí entre 3 y 8 recomendaciones, priorizando las que tengan evidencia más fuerte (mayor sampleSize o diferencia más marcada).`;
}

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

Con esto, generá las recomendaciones.`;
}

/**
 * No hay una sección de "voz" en el manual de marca (Awareness_AI_Manual_de_Marca.md
 * es un manual visual) — esto adapta su §1 "Personalidad visual" a un registro
 * de escritura, que es lo que pide Plans/03 §3.6 ("la voz del manual de marca").
 */
function buildBrandVoicePrompt(): string {
  return `Voz de marca (Awareness AI, adaptada del manual de identidad visual §1):
- Clara: explica sin sonar inaccesible ni abusar de jerga técnica.
- Dinámica: transmite impulso y ganas de actuar, sin gritar ni forzar signos de exclamación.
- Minimalista: cada palabra cumple una función. Nada de relleno motivacional genérico.
- Premium y confiable: seguridad tranquila, nunca vende humo ni promete de más.
- Humana: la tecnología acompaña a las personas, nunca suena robótica ni impersonal.
Español rioplatense, tono profesional y cercano.`;
}

/**
 * System prompt del chat de generación (§3.6). Va como prefijo con
 * cache_control en lib/brand/ai/chat.ts: la voz y el mejor contenido no
 * cambian mensaje a mensaje, así que se cachean y la pregunta variable del
 * usuario queda después del último breakpoint.
 */
export function buildChatSystemPrompt(topPosts: AnalysisPost[]): string {
  const bestContent =
    topPosts.length > 0
      ? `Contenido propio que mejor funcionó últimamente (para inspirarte en qué repetir — nunca copiar literal):\n${topPosts.map(formatPost).join("\n")}`
      : "Todavía no hay suficiente contenido sincronizado con métricas como para citar qué funcionó mejor. Si hace falta, usá buscar_mis_posts para revisar qué hay disponible.";

  return `Sos el asistente de generación de contenido del Gestor de Marca Personal de Awareness AI. Ayudás a preparar el próximo contenido para Instagram: ideas, guiones (hook / desarrollo / CTA), captions y hashtags.

${buildBrandVoicePrompt()}

${bestContent}

Reglas:
- Fundamentá una idea en un post o reel concreto cuando puedas: usá buscar_mis_posts para encontrarlo y metricas_de_post para ver cómo evolucionó, en vez de inventar.
- Usá la búsqueda web sólo para tendencias actuales del nicho — nunca para inventar datos de la propia cuenta.
- Cuando el usuario pida un guion, estructuralo con encabezados claros: Hook, Desarrollo, CTA.
- Sé conciso: la entrega es el contenido en sí, no un ensayo sobre por qué la idea es buena.`;
}
