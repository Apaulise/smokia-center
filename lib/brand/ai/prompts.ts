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
import type { FollowerSurprise } from "@/lib/brand/goals/attribution";
import {
  formatCount,
  formatIsoDate,
  formatPerDay,
  formatProgressLine,
  MIN_HISTORY_DAYS,
  type GoalProgress,
} from "@/lib/brand/goals/progress";
import type { KnowledgeRow } from "@/lib/brand/knowledge/queries";
import { KNOWLEDGE_COLLECTIONS, type KnowledgeCollection } from "@/lib/brand/knowledge/schema";
import type { PublishedHypothesis } from "@/lib/brand/planner/queries";
import { OBJECTIVE_LABEL, type ContentKind, type ContentObjective } from "@/lib/brand/planner/schema";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const PLATFORM_LABEL: Record<BrandPlatform, string> = { INSTAGRAM: "Instagram", YOUTUBE: "YouTube" };

/**
 * Windsor no es en vivo: el cron sincroniza una vez por día (plan Hobby de
 * Vercel) y abrir /marca/generar dispara como mucho una sincronización si la
 * última completada tiene más de AUTO_SYNC_MIN_HOURS. Sin esta línea el
 * modelo lee `brand_post_metrics` como si fuera el conteo de Instagram en
 * vivo y lo afirma así — sobre todo desastroso en una pieza de las últimas
 * horas, que es justo la que más está moviéndose.
 */
function formatSyncFreshness(lastSyncedAt: string | null): string {
  if (!lastSyncedAt) {
    return "Última sincronización de métricas con Windsor: nunca. Los números de abajo pueden no existir todavía o estar muy desactualizados — no los presentes como el estado actual de la cuenta.";
  }
  const minutes = Math.round((Date.now() - new Date(lastSyncedAt).getTime()) / 60000);
  const relative = minutes < 60 ? `hace ${minutes} min` : minutes < 1440 ? `hace ${Math.round(minutes / 60)} h` : `hace ${Math.round(minutes / 1440)} d`;
  return `Última sincronización de métricas con Windsor: ${relative}. Los números de reach/views/likes/guardados de abajo son de esa foto, no en vivo — pueden haber subido bastante desde entonces, sobre todo en piezas publicadas en las últimas horas o días. Si Agus dice que un número ya cambió, confiá en lo que dice en vez de insistir con el dato viejo, y aclará que tu lectura es "a la última sincronización" cuando cites una cifra de una pieza reciente.`;
}

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
 * Las piezas publicadas desde el planificador que salieron con una hipótesis
 * escrita, junto a su resultado (§3.7). Es lo que cierra el ciclo del SOC §12:
 * comparar lo que pasó contra lo que se dijo ANTES de grabar. Son datos del
 * turno, no del prompt cacheado — cambian cada vez que sale una pieza.
 */
export function formatHypothesisTests(tests: PublishedHypothesis[], results: Record<string, PostResult>): string {
  if (tests.length === 0) return "  (ninguna pieza publicada desde el planificador con hipótesis escrita)";

  return tests
    .map((test) => {
      const result = test.post_id ? formatResult(results[test.post_id]) : null;
      const parts = [
        `"${test.title}"`,
        KIND_LABEL[test.kind] ?? test.kind,
        test.objective ? `objetivo=${test.objective}` : "sin objetivo declarado",
        test.post_id ? `postId=${test.post_id}` : "todavía sin empalmar con sus métricas (no se puede concluir nada)",
        result ?? (test.post_id ? "sin clasificar todavía (recién publicada o sin baseline)" : null),
        test.parent_item_id ? "es variante de un ganador (explotación)" : "experimento nuevo (exploración)",
        `hipótesis="${(test.hypothesis ?? "").replace(/\s+/g, " ").slice(0, 400)}"`,
        test.hook ? `hook="${test.hook.slice(0, 160)}"` : null,
        test.angle ? `ángulo="${test.angle.slice(0, 160)}"` : null,
      ].filter(Boolean);
      return `  - ${parts.join(", ")}`;
    })
    .join("\n");
}

/**
 * Datos + instrucciones de tarea para §3.5 (Plans/03 §3.10, "Ampliación del
 * SOC"). El criterio editorial —qué es un ganador, cómo leerlo, qué hacer con
 * un cluster— vive en el SOC (system prompt, lib/brand/ai/content-os.ts).
 * Esto es sólo lo que el SOC no puede saber: la forma de los datos que le
 * mandamos y el esquema de salida que espera nuestra base.
 */
export function buildRecommendationsUserPrompt(
  platform: BrandPlatform,
  insights: BrandInsightsSummary,
  hypotheses: PublishedHypothesis[] = [],
): string {
  // Sólo se agrega si hay algo que comparar: sin piezas planificadas con hipótesis la sección sería ruido.
  const hypothesesSection =
    hypotheses.length > 0
      ? `

## Hipótesis testeadas (piezas publicadas desde el planificador, con la hipótesis que se escribió ANTES de grabar)
${formatHypothesisTests(hypotheses, insights.results)}

Cerrá el ciclo del SOC §12: para cada pieza con clasificación, decí si la hipótesis se sostuvo o no, citándola. Si se sostuvo, va en "knowns"; si el resultado es ambiguo, en "hypotheses". Una pieza sin empalmar, MADURANDO o SIN_BASELINE no permite concluir nada todavía: decilo en "unknowns" en vez de forzar una conclusión.

Si hay más piezas para cerrar que las que entran en el límite de viñetas de abajo, priorizá las de evidencia más fuerte y agrupá el resto en una sola viñeta ("y N piezas más sin sorpresas") en vez de listarlas todas.`
      : "";

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
${insights.bottomPosts.map((p) => formatPost(p, insights.results[p.postId])).join("\n") || "  (sin datos suficientes)"}${hypothesesSection}

Analizá esto siguiendo el §29 del SOC: qué sabemos, qué sospechamos, qué no sabemos todavía — y de ahí, qué duplicarías (REPETIR), qué reducirías (CORTAR) y qué testearías ahora (PROBAR). Nunca recalcules ni inventes aritmética: los números de arriba ya están bien, tu trabajo es la lectura.

La "clasificación" de cada pieza (GANADOR_ALCANCE, GANADOR_AUTORIDAD, NEUTRO, EXPERIMENTO_FALLIDO) ya está calculada contra el baseline propio: usala tal cual. SIN_BASELINE y MADURANDO significan que de esa pieza todavía no se puede afirmar nada. La conversión no se mide en este sistema: no clasifiques nada como ganador de conversión.

Reglas de esquema, no de criterio editorial:
- "knowns", "hypotheses" y "unknowns" van en markdown: una lista de viñetas (3 a 6 cada una, nunca más de 6 aunque haya más para decir), cada viñeta una sola oración corta. Esto se muestra en una card compacta, no en un informe — nada de párrafos largos ni de repetir el mismo punto con otras palabras. Cada sección entera (las viñetas juntas) tiene que entrar en 900 caracteres: si al escribirla se pasa, cortá viñetas o acortalas, no la mandes larga.
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

export interface GoalSnapshot {
  progress: GoalProgress | null;
  /** Piezas cuya tasa de seguidores por view duplica la de las demás (§3.13). */
  surprises: FollowerSurprise[];
}

/**
 * La meta de seguidores vista desde el turno (§3.13). Es dato del turno y no del
 * prompt cacheado: el avance cambia con cada sincronización. Los números vienen
 * calculados de `lib/brand/goals`; el modelo los cita y no los recalcula.
 *
 * Las sorpresas viajan rotuladas como estimación de evidencia débil (SOC §18): el
 * dato de seguidores por pieza es una diferencia de fotos diarias, no un conteo
 * que entregue Instagram, y con pocos seguidores un solo seguidor domina la ventana.
 */
function formatGoal(goal: GoalSnapshot | undefined, posts: AnalysisPost[]): string {
  const progress = goal?.progress;
  if (!goal || !progress) {
    return "Meta de seguidores: todavía no hay una definida. Si Agus la menciona, se define desde el dashboard de Marca (/marca), no desde el chat.";
  }

  const deadline = progress.deadline
    ? `Plazo: ${formatIsoDate(progress.deadline)}${
        progress.daysLeft !== null && progress.daysLeft > 0
          ? ` (quedan ${progress.daysLeft} días${progress.neededPerDay !== null ? `; hacen falta ${formatPerDay(progress.neededPerDay)}` : ""})`
          : " (vencido)"
      }.`
    : "Sin plazo.";

  const line =
    progress.current !== null ? `${formatProgressLine(progress.current, progress.target)}, faltan ${formatCount(progress.remaining ?? 0)}` : "sin conteo todavía";

  let pace: string;
  if (!progress.pace) {
    pace = `Ritmo real: no medido (hay ${progress.historyDays} de ${MIN_HISTORY_DAYS} días de historial de fotos diarias). No estimes ni inventes un ritmo ni una fecha de llegada.`;
  } else {
    const projection =
      progress.projection?.kind === "FECHA"
        ? `a este ritmo se llega el ${formatIsoDate(progress.projection.date)}`
        : progress.projection?.kind === "ESTANCADO"
          ? "a este ritmo no se llega (el ritmo es cero o negativo)"
          : progress.projection?.kind === "LEJOS"
            ? "a este ritmo se tardaría más de 10 años"
            : "meta ya alcanzada";
    pace = `Ritmo real: ${formatPerDay(progress.pace.perDay)} (${formatIsoDate(progress.pace.fromDay)} a ${formatIsoDate(progress.pace.toDay)}); ${projection}.`;
  }

  const captionOf = new Map(posts.map((p) => [p.postId, p.caption]));
  const surprises =
    goal.surprises.length === 0
      ? "  (ninguna: hacen falta al menos 5 piezas con ventana limpia y mediana mayor a 0)"
      : goal.surprises
          .slice(0, 3)
          .map((s) => {
            const caption = captionOf.get(s.postId);
            return `  - postId=${s.postId}${caption ? `, caption="${caption.slice(0, 100).replace(/\s+/g, " ")}"` : ""}: ${s.followers > 0 ? "+" : ""}${s.followers} seguidores con ${s.views} views (${s.perThousandViews.toFixed(1)} por 1.000 views, ${formatMultiple(s.multiple)} la mediana de las demás)`;
          })
          .join("\n");

  return `Meta de seguidores${progress.achieved ? " (CUMPLIDA)" : ""}: ${line}. ${deadline}
${pace}
La meta se trabaja con el ciclo del SOC: probar formatos con variantes hasta encontrar la idea ganadora y repetirla. Agus define ganadora por alcance y views: un video de 100 mil views tiene más chances de dejar seguidores que uno de 10 mil.
Sorpresas de seguidores por pieza (ESTIMACIÓN; evidencia débil, SOC §18): piezas con ventana limpia cuya tasa de seguidores por view duplica la mediana de las demás. Es una pista para tener en cuenta y NUNCA cambia la clasificación de una pieza, que sigue siendo por alcance y autoridad:
${surprises}`;
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
  hypotheses: PublishedHypothesis[] = [],
  goal?: GoalSnapshot,
  lastSyncedAt?: string | null,
): string {
  const freshnessBlock = formatSyncFreshness(lastSyncedAt ?? null);
  const knowledgeBlock = formatKnowledge(knowledge);
  const goalBlock = formatGoal(goal, posts);
  const hypothesesBlock =
    hypotheses.length > 0
      ? `\n\nHipótesis de piezas ya publicadas (SOC §12: se compara lo que pasó contra lo que se dijo antes de grabar). Si una ya tiene resultado, concluí si se sostuvo y guardá la conclusión en APRENDIZAJES (si funcionó) o LOSERS (si no) con guardar_conocimiento, vinculada por post_id:\n${formatHypothesisTests(hypotheses, insights?.results ?? {})}`
      : "";

  if (!insights) {
    return `${freshnessBlock}

Estado del sistema: todavía no hay suficiente contenido propio sincronizado con métricas. Si hace falta, usá buscar_mis_posts para ver qué hay disponible.

${knowledgeBlock}

${goalBlock}${hypothesesBlock}`;
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
${freshnessBlock}
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

${knowledgeBlock}

${goalBlock}${hypothesesBlock}`;
}

/**
 * Datos + tarea para el botón "Usar" de competencia (Plans/03 §3.14): un reel
 * ajeno que explotó → una pieza propia en la bandeja del planificador.
 *
 * El criterio editorial vive en el SOC (system prompt). Acá va sólo lo que el
 * SOC no puede saber: la publicación concreta y lo que la marca ya viene
 * haciendo. La instrucción central —copiar el MECANISMO, no el tema (SOC §7)—
 * se repite igual, porque es exactamente el error que esta pantalla invita a
 * cometer.
 */
export function buildOutlierIdeaPrompt(params: {
  username: string;
  displayName: string | null;
  kind: string;
  multiple: number;
  value: number;
  median: number;
  signalLabel: string;
  publishedAt: string | null;
  caption: string | null;
  permalink: string | null;
  /** Lo propio: cadencia, mezcla y de qué viene hablando la cuenta. Es lo que evita una pieza genérica. */
  ownContext: string;
}): string {
  return `Una cuenta que seguimos publicó algo que rindió muy por encima de lo normal de su propia cuenta. Quiero convertirlo en una pieza nuestra.

## La publicación ajena
- Cuenta: @${params.username}${params.displayName ? ` (${params.displayName})` : ""}
- Formato: ${params.kind}
- Rendimiento: ${formatCount(params.value)} ${params.signalLabel}, ${formatMultiple(params.multiple)} la mediana de su propia cuenta (${formatCount(params.median)})
- Fecha: ${params.publishedAt ? params.publishedAt.slice(0, 10) : "sin fecha"}
- Link: ${params.permalink ?? "(sin link)"}
- Texto de la publicación:
"""
${(params.caption ?? "(sin texto)").slice(0, 2000)}
"""

## Nuestra cuenta
${params.ownContext}

## La tarea
Escribí UNA pieza nuestra a partir de esa publicación.

**Primero decidí una sola cosa: ¿el tema de esa publicación es un tema del que esta marca puede hablar con autoridad?**

- **Si SÍ —y es lo normal cuando habla de IA, de Claude, de ChatGPT, de agentes, de automatización o de herramientas—, el tema SE MANTIENE.** No lo cambies, no lo traslades, no busques "el equivalente en nuestro nicho". Se hace la misma pieza sobre el mismo tema, con nuestro contenido: nuestra selección, nuestros ejemplos, nuestra experiencia. Pueden ser los mismos ítems que nombraron ellos, otros mejores, o una mezcla.
- **Si NO** —porque el tema es su vida personal, su rubro, su cara, algo que nosotros no podríamos sostener— entonces sí: se conserva el mecanismo (el gancho, la estructura, la promesa, el llamado a la acción) y el tema lo ponés vos, de lo nuestro.

Ejemplo de lo que NO hay que hacer: si el reel ajeno es "5 plugins que tenés que tener antes de usar Claude", la pieza nuestra sigue siendo sobre plugins de Claude —los que elijamos nosotros—, y NO se convierte en "5 nodos de n8n que tenés que conocer". Cambiar de tema cuando el tema ya era nuestro es perder justamente lo que funcionó.

**Concreto, no genérico.** Nombrá las herramientas, los pasos, los números y los ejemplos puntuales, con nombre y apellido. Nada de "[herramienta]", "varias opciones" ni listas que servirían para cualquier cuenta: si la pieza se puede publicar tal cual desde otra cuenta del rubro, está mal escrita.

- "title": corto, para encontrarla en la bandeja. No es el gancho.
- "hook": las primeras palabras que se dicen o se leen, tal cual van a salir.
- "angle": el ángulo, en una frase.
- "hypothesis": qué estamos probando y por qué creemos que va a funcionar, con la forma del SOC ("Probamos si [formato] aplicado a [tema] mediante [ángulo] rinde mejor porque […]"). Tiene que decir qué le copiamos a la pieza ajena y si mantuvimos el tema o sólo el mecanismo.
- "idea": el desarrollo — qué se muestra y qué se dice, en orden, con los ítems ya elegidos y nombrados. Suficiente para grabarlo sin volver a pensar nada.
- "kind" y "objective": lo que corresponda a lo que escribiste, no lo que tenía la pieza ajena.
- "hashtags": pocos y pertinentes, o ninguno.

Todo en español rioplatense, con nuestra voz. Nada de explicar lo que hiciste: devolvé sólo la pieza.`;
}

/** Cómo se escribe el guion según el formato: un reel se dice y se ve, un carrusel se lee slide por slide. */
const SCRIPT_FORMAT: Record<ContentKind, string> = {
  REEL: `Escribilo como escenas en orden. Cada escena, dos líneas: "VISUAL:" lo que se ve (qué se graba o se muestra en pantalla, concreto) y "DICE:" lo que Agus dice, tal cual lo diría en voz alta. Al lado de cada escena, una duración aproximada en segundos, y al final una línea con la duración total estimada. La duración sale de lo que hay que mostrar: no se estira para llegar a un número.`,
  SHORT: `Escribilo como escenas en orden. Cada escena, dos líneas: "VISUAL:" lo que se ve y "DICE:" lo que Agus dice, tal cual lo diría en voz alta. Al lado de cada escena, una duración aproximada en segundos, y al final la duración total estimada. La duración sale de lo que hay que mostrar: no se estira.`,
  VIDEO: `Escribilo como bloques en orden, cada uno con "VISUAL:" (qué se ve) y "DICE:" (lo que Agus dice, tal cual lo diría en voz alta), con una duración aproximada por bloque. Es un video largo: el hook y los primeros segundos pesan igual que en un reel, y cada bloque tiene que ganarse el siguiente.`,
  CARRUSEL: `Escribilo slide por slide: "SLIDE 1", "SLIDE 2"… Cada slide lleva "TEXTO:" (lo que se lee en pantalla, corto) y "VISUAL:" (qué imagen, captura o diseño lo acompaña). La slide 1 es el hook: tiene que funcionar sola en el feed. Cada slide tiene que dar ganas de pasar a la siguiente; la última cierra con el aprendizaje o la opinión de Agus, no con un resumen.`,
  POST: `Escribilo como una sola pieza: "IMAGEN:" qué muestra la imagen, "TEXTO EN LA IMAGEN:" lo que se lee en ella, y "ARRANQUE DEL CAPTION:" la primera línea del caption, que es lo único que se ve antes del "ver más".`,
  HISTORIA: `Escribilo como una secuencia de historias, una por bloque: "HISTORIA 1", "HISTORIA 2"… Cada una con "VISUAL:" (qué se ve o se graba), "TEXTO / DICE:" (lo que se lee o se dice) y, si ayuda a la interacción, el sticker que usarías (encuesta, pregunta, quiz) con su texto exacto. Sin caption ni hashtags: las historias no los llevan.`,
};

/**
 * Datos + tarea para el botón "Generar guion" del diálogo de la pieza (Plans/03
 * §3.7): la idea que ya está escrita → el guion para grabarla.
 *
 * El SOC (system prompt) ya define la voz y las reglas del §23. Acá va lo que
 * el SOC no puede saber: la idea concreta, lo que la cuenta ya viene haciendo y
 * lo que la base de conocimiento guardó. Y la instrucción que evita el guion
 * típico: la estructura no es una plantilla, sale de lo que esta idea necesita.
 */
export function buildScriptPrompt(params: {
  title: string;
  kind: ContentKind;
  objective: ContentObjective | null;
  hypothesis: string | null;
  hook: string | null;
  angle: string | null;
  idea: string;
  /** Lo propio: cadencia, mezcla, ganadores y notas de conocimiento. Es lo que evita un guion que sirve para cualquier cuenta. */
  ownContext: string;
}): string {
  return `Tengo una idea cargada en el planificador y necesito el guion para grabarla.

## La pieza
- Título: ${params.title || "(sin título)"}
- Formato: ${KIND_LABEL[params.kind]}
- Objetivo: ${params.objective ? OBJECTIVE_LABEL[params.objective] : "(sin definir)"}
- Hipótesis que se está probando: ${params.hypothesis ?? "(sin hipótesis escrita)"}
- Hook definido: ${params.hook ?? "(sin hook definido)"}
- Ángulo: ${params.angle ?? "(sin ángulo definido)"}

## La idea, tal como la escribió Agus
"""
${params.idea.slice(0, 8000)}
"""

## Nuestra cuenta
${params.ownContext}

## La tarea
Escribí el guion de ESA idea. No es un guion genérico ni una plantilla rellena: es el guion de esta pieza y no de otra.

**Cómo evitar el guion típico**
- Buscá qué tiene de propio la idea (la herramienta, la situación, el resultado, el giro) y construí todo alrededor de eso. Si cambiando un sustantivo el guion serviría para cualquier otro tema, está mal escrito.
- No hay estructura obligatoria (SOC §20): la base es hook → contexto/problema → demo/historia/experimento → resultado → aprendizaje u opinión de Agus → cierre natural, pero sacá las partes que esta idea no necesita y reordená lo que haga falta. Ninguna parte existe sólo por cumplir la estructura.
- Mostrar antes de explicar. Lo primero que aparece es la cosa, el resultado o el problema, no la presentación de quién habla ni de qué va el video.
- El hook tiene que funcionar para alguien que nunca vio a Agus (SOC §10) y el resto del guion tiene que cumplir lo que promete. Si ya hay un hook definido, es el punto de partida: usalo tal cual si es bueno. Si es flojo, escribí uno mejor y decilo en "caveat".
- El cierre sale del contenido (el aprendizaje, la opinión de Agus). No un "seguime para más" pegado al final.
- La hipótesis manda: el guion tiene que servir para probarla. No sumes elementos que confundan qué variable se está midiendo.
- Usá lo de "Nuestra cuenta" como evidencia de cómo suena y qué funciona en esta cuenta, no como contenido para repetir.

**Lo que no se inventa (SOC §23)**
No inventes cifras, experiencias, clientes ni resultados. Los pasos, las herramientas y la estructura sí los podés escribir con nombre y apellido. Pero cuando una escena necesita un dato real que la idea no trae (cuánto tardó, qué pasó al probarlo, un número), dejá un hueco explícito con esta forma: [AGUS: qué dato real va acá]. Pocos huecos y sólo donde el dato es de Agus: no sustituyen contenido que sí podés escribir.

**Formato de salida**
${SCRIPT_FORMAT[params.kind]}

Lo que se dice va en español rioplatense hablado, con frases cortas, como suena Agus: sin tono corporativo, sin tono de gurú, sin saludo inicial. Leelo en voz alta mentalmente: si una frase no se diría así, reescribila.

- "script": el guion completo, listo para grabar. Nada de explicar lo que hiciste ni de comentarios fuera del guion.
- "caveat": sólo si la idea tiene un problema que el guion no puede arreglar (SOC §24): qué falla y dónde se perdería la atención, en una o dos oraciones. Si no hay nada que objetar, dejalo vacío.`;
}
