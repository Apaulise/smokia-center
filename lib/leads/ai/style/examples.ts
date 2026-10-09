import { STYLE_BLOCK_MAX_CHARS, STYLE_EXAMPLE_LIMIT } from "@/lib/leads/ai/style/constants";
import { isRealEdit } from "@/lib/leads/ai/style/diff";
import { createClient } from "@/lib/supabase/server";

/**
 * Pares (propuesto por la IA → enviado por el vendedor) que se inyectan en el
 * prompt para que el agente aprenda de las correcciones a mano (Plan §1.20.1).
 * Sólo cuentan las ediciones reales (`isRealEdit`), no los typos.
 */
export interface StyleExample {
  proposed: string;
  sent: string;
  leadId: string;
  kind: string | null;
}

const CANDIDATE_WINDOW = 60;

/**
 * Prioridad: primero lo que el vendedor corrigió en ESTE lead (ajuste por
 * lead), después correcciones recientes del mismo tipo de mensaje (estilo
 * general). Dentro de cada grupo, lo más nuevo primero.
 */
export async function listStyleExamples(params: { leadId: string; kind: string }): Promise<StyleExample[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_messages")
    .select(STYLE_EXAMPLE_COLUMNS)
    .eq("sender", "VENDEDOR")
    .not("generated_content", "is", null)
    .order("occurred_at", { ascending: false })
    .limit(CANDIDATE_WINDOW);
  if (error) throw error;
  return selectStyleExamples(data ?? [], params);
}

/** Columnas de `lead_messages` que necesita `selectStyleExamples`. */
export const STYLE_EXAMPLE_COLUMNS = "lead_id, kind, content, generated_content, edit_distance, occurred_at";

/** Tope de candidatos que se leen de la base antes de filtrar (lo usa también la API de automatización). */
export const STYLE_CANDIDATE_WINDOW = CANDIDATE_WINDOW;

/**
 * La selección en sí, sin tocar la base: la comparten `listStyleExamples`
 * (cliente con RLS) y la API de automatización (service role, ya filtrada por
 * owner_id), para que las dos elijan exactamente los mismos ejemplos.
 */
export function selectStyleExamples(
  rows: { lead_id: string; kind: string | null; content: string; generated_content: string | null; edit_distance: number | null }[],
  params: { leadId: string; kind: string },
): StyleExample[] {
  const edits = rows
    .filter((row) => row.generated_content && isRealEdit(row.edit_distance ?? 0, row.content.length))
    .map((row) => ({ proposed: row.generated_content as string, sent: row.content, leadId: row.lead_id, kind: row.kind }));

  const sameLead = edits.filter((e) => e.leadId === params.leadId);
  const sameKind = edits.filter((e) => e.leadId !== params.leadId && e.kind === params.kind);
  return [...sameLead, ...sameKind].slice(0, STYLE_EXAMPLE_LIMIT);
}

/** Bloque de prompt con los ejemplos, truncando los más viejos si pasa el tope. */
export function buildStyleBlock(examples: StyleExample[], leadId: string): string {
  if (examples.length === 0) return "";
  const render = (e: StyleExample) =>
    `${e.leadId === leadId ? "[ESTE LEAD]" : "[otro lead]"}\nLa IA propuso: ${e.proposed.trim()}\nEl vendedor lo mandó así: ${e.sent.trim()}`;

  // Se descartan desde el final (los menos prioritarios / más viejos) hasta entrar en el tope.
  const kept = [...examples];
  while (kept.length > 1 && kept.map(render).join("\n\n").length > STYLE_BLOCK_MAX_CHARS) kept.pop();

  return `\n\n## Correcciones del vendedor a borradores anteriores (aprendé de esto)\nSon mensajes que la IA propuso y el vendedor reescribió a mano antes de enviarlos. Fijate qué cambió — tono, largo, formalidad, cosas que sacó o agregó — y aplicá esas mismas preferencias, sobre todo las marcadas [ESTE LEAD]. Primero deducí en una línea qué patrón se repite (por ejemplo: cambió el saludo, agregó una referencia al mensaje anterior, acortó) y aplicalo. Estas correcciones PREVALECEN sobre las reglas generales de tono y los "prohibido" de este pedido: si el vendedor hizo algo que una regla de arriba desaconseja, es porque así lo prefiere. No copies el contenido de estos mensajes: son de otros momentos o negocios; sólo imitá el estilo.\n\n${kept.map(render).join("\n\n")}`;
}
