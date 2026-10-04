/**
 * Cliente HTTP crudo contra la API de Google AI Studio (Gemini) — sin SDK,
 * espejo de lib/meta/client.ts.
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

interface GeminiErrorBody {
  error?: {
    message?: string;
    details?: {
      "@type"?: string;
      violations?: { quotaMetric?: string; quotaId?: string; quotaDimensions?: { model?: string } }[];
      retryDelay?: string;
    }[];
  };
}

async function geminiErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as GeminiErrorBody;
    if (body.error?.message) {
      // En un 429 el mensaje no dice *qué* cuota se agotó (por minuto, por día,
      // grounding…). Eso viene en los details; sin ellos no se puede decidir
      // entre esperar y cambiar de modelo o de plan.
      const extra: string[] = [];
      for (const detail of body.error.details ?? []) {
        for (const violation of detail.violations ?? []) {
          const id = violation.quotaId ?? violation.quotaMetric;
          if (id) extra.push(violation.quotaDimensions?.model ? `${id} @ ${violation.quotaDimensions.model}` : id);
        }
        if (detail.retryDelay) extra.push(`reintentar en ${detail.retryDelay}`);
      }
      const message = body.error.message.trim();
      if (extra.length > 0) return `${message} [HTTP ${response.status}: ${extra.join("; ")}]`;
      // Sin violations reconocibles: se adjunta el detalle crudo (no lleva la key).
      const raw = body.error.details ? JSON.stringify(body.error.details).slice(0, 600) : "sin details";
      return `${message} [HTTP ${response.status}: ${raw}]`;
    }
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

export interface GeminiGroundedParams {
  apiKey: string;
  system: string;
  prompt: string;
  model?: string;
  maxOutputTokens?: number;
}

export interface GeminiGroundedResult {
  text: string;
  /**
   * Si el modelo efectivamente buscó o leyó algo real, según los metadatos
   * que Gemini devuelve por fuera del texto. `google_search` y `url_context`
   * son herramientas que el modelo puede decidir NO usar — sin este chequeo,
   * un texto en prosa perfectamente convincente puede salir enteramente del
   * conocimiento de entrenamiento (genérico para el rubro) sin que nada lo
   * distinga de un hecho verificado. Ver el llamador en enrich.ts.
   */
  grounded: boolean;
}

/**
 * Pase A del enriquecimiento (Plan §1.10): `google_search` + `url_context`,
 * salida en prosa. **`google_search` y `responseSchema` no conviven** —
 * Gemini apaga el grounding en silencio si se le pide JSON en la misma
 * llamada (el issue google-gemini/cookbook#1274 lo mide en gemini-3.5-flash:
 * 0 de 5 respuestas fundamentadas pidiendo JSON, 5 de 5 pidiendo prosa; no
 * tira error, devuelve un objeto plausible sin haber buscado nada). Por eso
 * esta función nunca acepta un `schema`: la estructura sale en un segundo
 * pase, sin herramientas, sobre el texto que esto devuelve.
 */
export async function generateGeminiGrounded(params: GeminiGroundedParams): Promise<GeminiGroundedResult> {
  const model = params.model ?? GEMINI_MODEL;

  const response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": params.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: [{ role: "user", parts: [{ text: params.prompt }] }],
      tools: [{ google_search: {} }, { url_context: {} }],
      generationConfig: {
        maxOutputTokens: params.maxOutputTokens ?? 4096,
        temperature: 0.3,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Gemini rechazó la consulta (${await geminiErrorMessage(response)})`);
  }

  const body = (await response.json()) as {
    candidates?: {
      content?: { parts?: { text?: string }[] };
      groundingMetadata?: { groundingChunks?: unknown[]; webSearchQueries?: string[] };
      urlContextMetadata?: { urlMetadata?: { urlRetrievalStatus?: string }[] };
    }[];
  };
  const candidate = body.candidates?.[0];
  const text = candidate?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  if (!text.trim()) throw new Error("Gemini devolvió una respuesta vacía (¿no encontró nada de este negocio?).");

  const searched = Boolean(
    (candidate?.groundingMetadata?.groundingChunks?.length ?? 0) > 0 ||
      (candidate?.groundingMetadata?.webSearchQueries?.length ?? 0) > 0,
  );
  const readUrl = Boolean(
    candidate?.urlContextMetadata?.urlMetadata?.some((entry) => entry.urlRetrievalStatus === "URL_RETRIEVAL_STATUS_SUCCESS"),
  );

  return { text, grounded: searched || readUrl };
}

/** Modelo del chat de Marca: más capaz que el lite, con contexto grande y TPM de sobra en el free tier (Groq gratis tope 8.000 TPM, no alcanza para el prompt del sistema). */
export const GEMINI_CHAT_MODEL = "gemini-3.5-flash";

export type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> }; thoughtSignature?: string }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiChatResult {
  text: string;
  toolCalls: { name: string; args: Record<string, unknown>; signature?: string }[];
  finishReason: string | null;
}

/**
 * Un turno de chat con function calling, en streaming SSE. Llama a `onText`
 * con cada fragmento visible (los "thought" se descartan) y devuelve el texto
 * y las llamadas a herramientas armadas. Quien llama las ejecuta y vuelve a
 * llamar (lib/brand/ai/chat.ts). `parametersJsonSchema` acepta JSON Schema
 * completo, a diferencia de `parameters` (subconjunto de OpenAPI).
 */
export async function streamGeminiChat(params: {
  apiKey: string;
  system: string;
  contents: GeminiContent[];
  tools: { name: string; description: string; parametersJsonSchema: Record<string, unknown> }[];
  onText: (delta: string) => void;
  model?: string;
  maxOutputTokens?: number;
}): Promise<GeminiChatResult> {
  const model = params.model ?? GEMINI_CHAT_MODEL;
  const response = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": params.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: params.system }] },
      contents: params.contents,
      tools: [{ functionDeclarations: params.tools }],
      generationConfig: { maxOutputTokens: params.maxOutputTokens ?? 8192, temperature: 0.7 },
    }),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Gemini rechazó la consulta (${await geminiErrorMessage(response)})`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let finishReason: string | null = null;
  let blockReason: string | null = null;
  const toolCalls: GeminiChatResult["toolCalls"] = [];

  const handleLine = (line: string) => {
    if (!line.startsWith("data:")) return;
    const data = line.slice(5).trim();
    if (!data) return;
    let chunk: {
      candidates?: {
        content?: {
          parts?: {
            text?: string;
            thought?: boolean;
            thoughtSignature?: string;
            functionCall?: { name?: string; args?: Record<string, unknown> };
          }[];
        };
        finishReason?: string;
      }[];
      promptFeedback?: { blockReason?: string };
      error?: { message?: string };
    };
    try {
      chunk = JSON.parse(data);
    } catch {
      return;
    }
    if (chunk.error?.message) throw new Error(`Gemini cortó la respuesta (${chunk.error.message})`);
    if (chunk.promptFeedback?.blockReason) blockReason = chunk.promptFeedback.blockReason;
    const candidate = chunk.candidates?.[0];
    if (!candidate) return;
    for (const part of candidate.content?.parts ?? []) {
      if (part.functionCall?.name) {
        toolCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {}, signature: part.thoughtSignature });
      } else if (part.text && !part.thought) {
        text += part.text;
        params.onText(part.text);
      }
    }
    if (candidate.finishReason) finishReason = candidate.finishReason;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) handleLine(line.trimEnd());
  }
  if (buffer) handleLine(buffer.trimEnd());

  if (blockReason && !text && toolCalls.length === 0) throw new Error(`Gemini bloqueó el pedido (${blockReason}).`);
  return { text, toolCalls, finishReason };
}
