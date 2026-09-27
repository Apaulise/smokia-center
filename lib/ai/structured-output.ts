import { z } from "zod";

/**
 * Ni Groq ni Gemini tienen el chequeo nativo que Anthropic hacía en
 * `messages.parse()` (`"Failed to parse structured output"`). Reemplazo
 * genérico para los 7 llamados de la Etapa 1 de
 * Plans/migracion-fuera-de-anthropic.md: sin nada de proveedor ni dominio.
 *
 * Un solo reintento, con el detalle del error en el prompt de reparación — un
 * modelo gratis sin chequeo nativo falla más seguido, y el reintento es
 * gratis.
 */
export async function resolveStructuredJson<T>(
  schema: z.ZodType<T>,
  attempt: (repairNote: string | null) => Promise<string>,
): Promise<T> {
  const tryOnce = async (repairNote: string | null): Promise<T> => {
    const raw = await attempt(repairNote);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch (error) {
      throw new Error(`el modelo no devolvió JSON válido (${error instanceof Error ? error.message : "sin detalle"})`);
    }
    return schema.parse(json);
  };

  try {
    return await tryOnce(null);
  } catch (firstError) {
    const detail = firstError instanceof Error ? firstError.message : String(firstError);
    return tryOnce(
      `Tu respuesta anterior no era válida: ${detail}. Devolvé de nuevo el JSON completo, corrigiendo eso, sin texto extra ni explicación.`,
    );
  }
}
