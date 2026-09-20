import { formatCadence, formatMix } from "@/lib/brand/competitors/format";
import { computeCadence, computeFormatMix } from "@/lib/brand/competitors/insights";
import { computeBrandInsights, type AnalysisPost } from "@/lib/brand/insights";
import { searchKnowledge } from "@/lib/brand/knowledge/queries";
import { COLLECTION_LABEL, ORIGIN_LABEL, type KnowledgeCollection } from "@/lib/brand/knowledge/schema";
import { KIND_LABEL } from "@/lib/brand/planner/schema";
import { getBrandPostsForAnalysis } from "@/lib/brand/queries";

import { formatPost } from "./prompts";

const PLATFORM = "INSTAGRAM" as const;

/** Cuántas publicaciones propias se le muestran al modelo como muestra de la voz y los temas reales. */
const OWN_SAMPLE = 6;
const WINNERS_SAMPLE = 3;
const NOTES_PER_COLLECTION = 4;
const NOTE_BODY_CHARS = 400;

/**
 * Las colecciones de §3.12 que le cambian la mano a un guion: cómo abre lo que
 * a Agus le funciona, qué ya falló y qué pregunta o objeta la audiencia. Radar,
 * experimentos y aprendizajes quedan afuera a propósito: son sobre qué
 * producir, y eso ya lo decidió quien escribió la idea.
 */
const SCRIPT_COLLECTIONS = ["HOOKS", "WINNERS", "LOSERS", "AUDIENCIA"] as const satisfies readonly KnowledgeCollection[];

function describeOwnPosts(posts: AnalysisPost[]): string {
  if (posts.length === 0) return "Todavía no hay publicaciones propias sincronizadas.";

  const recent = posts
    .filter((post) => post.caption?.trim())
    .slice(-OWN_SAMPLE)
    .reverse()
    .map((post) => `- ${KIND_LABEL[post.kind]}: ${post.caption!.replace(/\s+/g, " ").trim().slice(0, 180)}`);

  return [
    `Cadencia: ${formatCadence(computeCadence(posts))}`,
    `Mezcla de formatos: ${formatMix(computeFormatMix(posts))}`,
    recent.length > 0 ? `Últimas publicaciones nuestras (de qué venimos hablando y con qué voz):\n${recent.join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Lo propio: cadencia, mezcla y de qué viene hablando la cuenta. Las últimas
 * publicaciones no son decoración — son lo que evita que la pieza salga
 * genérica, porque el SOC define la voz pero no los temas concretos de este mes.
 */
export async function buildOwnContext(): Promise<string> {
  try {
    return describeOwnPosts(await getBrandPostsForAnalysis(PLATFORM));
  } catch {
    // Sin contexto propio la pieza sale igual, apoyada sólo en el SOC.
    return "No se pudo leer el rendimiento propio.";
  }
}

function describeWinners(posts: AnalysisPost[]): string | null {
  const insights = computeBrandInsights(posts);
  if (!insights) return null;

  const winners = posts
    .filter((post) => {
      const classification = insights.results[post.postId]?.classification;
      return classification === "GANADOR_ALCANCE" || classification === "GANADOR_AUTORIDAD";
    })
    .filter((post) => post.publishedAt !== null)
    .sort((a, b) => (b.publishedAt as string).localeCompare(a.publishedAt as string))
    .slice(0, WINNERS_SAMPLE);
  if (winners.length === 0) return null;

  return `Piezas nuestras que ganaron contra su propio baseline (mirá cómo abren y qué prometen; no las copies):\n${winners
    .map((post) => formatPost(post, insights.results[post.postId]))
    .join("\n")}`;
}

async function describeKnowledge(): Promise<string | null> {
  const groups = await Promise.all(
    SCRIPT_COLLECTIONS.map(async (collection) => ({
      collection,
      rows: await searchKnowledge({ collection, limit: NOTES_PER_COLLECTION }),
    })),
  );

  const sections = groups
    .filter((group) => group.rows.length > 0)
    .map(({ collection, rows }) => {
      const notes = rows.map((row) => {
        const body = row.body?.replace(/\s+/g, " ").trim();
        const preview = body && body.length > NOTE_BODY_CHARS ? `${body.slice(0, NOTE_BODY_CHARS)}…` : body;
        return `- [${ORIGIN_LABEL[row.origin]}] ${row.title}${preview ? `: ${preview}` : ""}`;
      });
      return `${COLLECTION_LABEL[collection]}:\n${notes.join("\n")}`;
    });
  if (sections.length === 0) return null;

  return `Notas de la base de conocimiento. Pesan distinto (SOC §18): "Propio" salió de métricas de Agus; "Mercado" se vio afuera; "Hipótesis" todavía no se probó. Ninguna es un hecho establecido.\n${sections.join("\n")}`;
}

/**
 * Todo lo que el guion sabe de la cuenta más allá de la idea: lo que se viene
 * publicando, lo que ganó y lo que la base de conocimiento guardó sobre hooks,
 * ganadores, fracasos y audiencia. Cada bloque falla por separado: sin ninguno
 * de ellos el guion sale igual, apoyado en la idea y en el SOC.
 */
export async function buildScriptContext(): Promise<string> {
  const [posts, notes] = await Promise.all([
    getBrandPostsForAnalysis(PLATFORM).catch(() => null),
    describeKnowledge().catch(() => null),
  ]);

  const blocks = [
    posts ? describeOwnPosts(posts) : "No se pudo leer el rendimiento propio.",
    posts ? describeWinners(posts) : null,
    notes,
  ];
  return blocks.filter(Boolean).join("\n\n");
}
