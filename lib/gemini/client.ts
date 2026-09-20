/**
 * Cliente HTTP crudo contra la API de Google AI Studio (Gemini) — sin SDK,
 * espejo de lib/windsor/client.ts.
 *
 * Existe para las tareas del módulo que no justifican un modelo caro: hoy,
 * puntuar qué tan aprovechable es una publicación ajena para la marca
 * (Plans/03 §3.14). Lo que sí escribe una pieza sigue siendo Claude con el
 * Sistema Operativo de Contenido.
 *
 * La key viaja en un header, nunca en la URL ni en un log.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";

/**
 * El modelo más chico con salida estructurada y free tier permanente. Es una
 * constante con nombre porque el free tier de Google rota de modelo cada tanto.
 */
export const GEMINI_MODEL = "gemini-3.5-flash-lite";

/** Un esquema de respuesta como lo espera Gemini (subconjunto de OpenAPI, no JSON Schema completo). */
export type GeminiSchema = Record<string, unknown>;

async function geminiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) return body.error.message;
  } catch {
    // el cuerpo no era JSON — se informa sólo el status
  }
  return `status ${response.status}`;
}

export interface GeminiJsonParams {
  apiKey: string;
  /** Instrucción de sistema. Acá va el prompt canónico de la marca. */
  system: string;
  prompt: string;
  schema: GeminiSchema;
  model?: string;
  maxOutputTokens?: number;
}

/**
 * Una respuesta JSON del modelo, devuelta como texto crudo. Quien llama la
 * valida con Zod: la salida de un tercero nunca se usa sin parsear
 * (CLAUDE.md §5).
 */
export async function generateGeminiJson(params: GeminiJsonParams): Promise<string> {
  const model = params.model ?? GEMINI_MODEL;

  const response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": params.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: params.schema,
        maxOutputTokens: params.maxOutputTokens ?? 8192,
        // Una clasificación no se quiere creativa: el mismo caption tiene que
        // dar el mismo puntaje dos veces.
        temperature: 0,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini rechazó la consulta (${await geminiErrorMessage(response)})`);
  }

  const body = (await response.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini devolvió una respuesta vacía.");
  return text;
}
