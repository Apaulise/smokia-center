/**
 * Cliente HTTP para Huawei Cloud ModelArts Studio (MaaS), usando la API
 * compatible con OpenAI de CN-Hong Kong. Todas las decisiones comerciales
 * conservan sus system prompts y JSON Schemas; este archivo sólo cambia el
 * motor que los ejecuta.
 */

export const HUAWEI_MAAS_BASE =
  "https://api-ap-southeast-1.modelarts-maas.com/openai/v1/chat/completions";

export const HUAWEI_MAAS_MODEL = "deepseek-v4.1-flash-1017";
export const HUAWEI_MAAS_REASONING_EFFORT = "high" as const;

export type MaasJsonSchema = Record<string, unknown>;

/**
 * La consola y ejemplos de Huawei muestran la key de distintas formas. El
 * usuario puede copiar sólo el valor, `Bearer …` o incluso el header completo.
 * Normalizar al enviar evita construir accidentalmente `Bearer Bearer …`.
 */
export function normalizeMaasApiKey(value: string): string {
  let key = value.trim();
  key = key.replace(/^authorization\s*:\s*/i, "").trim();

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  key = key.replace(/^bearer\s+/i, "").trim();

  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1).trim();
  }

  return key;
}

async function maasErrorMessage(response: Response): Promise<string> {
  if (response.status === 401 || response.status === 403) {
    return "autenticación inválida. Usá una API key de MaaS creada en CN-Hong Kong; no una Access Key/Secret Key de IAM";
  }
  try {
    const body = (await response.json()) as {
      error?: { message?: string; code?: string };
      message?: string;
    };
    if (body.error?.message) return body.error.message;
    if (body.message) return body.message;
  } catch {
    // El cuerpo no era JSON: se informa sólo el status, sin exponer la key.
  }
  return `status ${response.status}`;
}

export interface MaasJsonParams {
  apiKey: string;
  system: string;
  prompt: string;
  schema: MaasJsonSchema;
  schemaName: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  reasoningEffort?: "none" | "low" | "high" | "max";
}

/** Devuelve texto crudo; cada llamador lo valida con su schema Zod. */
export async function generateMaasJson(params: MaasJsonParams): Promise<string> {
  const apiKey = normalizeMaasApiKey(params.apiKey);
  if (!apiKey) throw new Error("La API key de Huawei Cloud MaaS está vacía.");

  const response = await fetch(HUAWEI_MAAS_BASE, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model ?? HUAWEI_MAAS_MODEL,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      // La API OpenAI-compatible actual de MaaS garantiza argumentos
      // estructurados mediante function calling. `response_format.json_schema`
      // no figura en su contrato actual y puede ser ignorado por el modelo.
      tools: [
        {
          type: "function",
          function: {
            name: params.schemaName,
            description: "Entregá exclusivamente los datos solicitados por la aplicación.",
            parameters: params.schema,
          },
        },
      ],
      tool_choice: {
        type: "function",
        function: { name: params.schemaName },
      },
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens ?? 8192,
      reasoning_effort: params.reasoningEffort ?? HUAWEI_MAAS_REASONING_EFFORT,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error(`Huawei Cloud MaaS rechazó la consulta (${await maasErrorMessage(response)})`);
  }

  const body = (await response.json()) as {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: {
          function?: { name?: string; arguments?: string };
        }[];
      };
    }[];
  };
  const message = body.choices?.[0]?.message;
  const namedToolCall = message?.tool_calls?.find(
    (call) => call.function?.name === params.schemaName,
  );
  const text = namedToolCall?.function?.arguments ?? message?.content ?? "";
  if (!text.trim()) throw new Error("Huawei Cloud MaaS devolvió una respuesta vacía.");
  return text;
}
