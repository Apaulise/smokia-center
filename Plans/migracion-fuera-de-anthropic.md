# Migración fuera de Anthropic (Etapa 1) — Groq + Gemini

> **Estado (2026-09-27): Etapa 1 implementada de punta a punta (código y build), checklist manual de verificación pendiente en los 7 pasos.** No es una fase de negocio como 01/03 — es una migración de infraestructura transversal (toca Leads y Marca), por eso no lleva número de fase.
>
> Antes de correr el primer ítem del checklist: cargar la key de Groq en Configuración y confirmar en `console.groq.com/docs/models` que `GROQ_MODEL` (`openai/gpt-oss-120b`, en `lib/groq/client.ts`) sigue existiendo — dato sin verificar, ver Riesgos.

## Contexto

Al generar la primera apertura del copiloto de Leads, la app tiró "La API key guardada no se pudo leer" — un fallo de `decrypt()` sobre la fila `anthropic_api_key` en `settings`, no un bug del código nuevo (se confirmó leyendo `lib/crypto.ts`, `saveAnthropicKey`/`testAnthropicConnection` en `lib/settings/actions.ts`: son el mismo `decrypt()` y la misma fila que usa cualquier feature de IA de Marca). A partir de ahí, el usuario decidió que el problema de fondo no es ese bug puntual sino que **no quiere seguir pagando Anthropic**, y pidió reestructurar todas las funciones que dependen de Claude para usar alternativas gratuitas: **Groq** (ya tiene una API key propia, pensada para Llama 3) para lo que hoy exige más criterio, y **Gemini** (ya integrado, free tier) para lo que hoy es más mecánico.

**Alcance decidido:** toda la app (Leads + Marca), en dos etapas. Este documento es la **Etapa 1**: los 7 llamados a Claude que son de una sola pasada, sin tool-use ni streaming. La **Etapa 2** (`lib/brand/ai/chat.ts`, el chat de Marca con tool-use en loop + streaming en vivo vía Supabase Realtime) queda fuera de este plan — es un rediseño bastante más grande y se planifica aparte una vez validada la Etapa 1. **La key y todo el plumbing de Anthropic se dejan intactos**: `chat.ts` los sigue necesitando hasta la Etapa 2, así que el gasto en Anthropic no llega a cero todavía sólo con este trabajo.

**Aviso sobre un dato sin verificar:** durante el diseño, una búsqueda web señaló (citando blogs no oficiales, no la documentación oficial de Groq) que Llama 3 habría dejado de estar disponible en el free tier de Groq desde agosto de 2026, reemplazado por `openai/gpt-oss-120b`. No hay forma de confirmar esto de forma confiable desde acá, y el usuario ya decidió seguir con `gpt-oss-120b` como default de todos modos. **Antes de correr nada, confirmá en `console.groq.com/docs/models` con tu propia cuenta que ese modelo (o el que finalmente seleccionemos) existe y responde** — es un cambio de una sola constante (`GROQ_MODEL`) si hace falta ajustarlo.

## Mapeo de los 7 llamados

Mismo criterio que ya usaba el reparto Opus/Sonnet original (Plans/01 §1.7, "Reparto de modelos"): *decidir* va a Groq, *transformar un texto que ya existe* va a Gemini.

| # | Archivo | Función | Hoy | Pasa a | Schema Zod |
|---|---|---|---|---|---|
| 1 | `lib/leads/ai/analyze.ts` | `analyzeLeadResponse()` | `claude-opus-5` | **Groq** | `AnalyzeOutputSchema` |
| 2 | `lib/leads/ai/opening.ts` | `generateOpening()` | `claude-opus-5` | **Groq** | `OpeningSchema` |
| 3 | `lib/leads/ai/follow-up.ts` | `generateFollowup()` | `claude-opus-5` | **Groq** | `FollowUpSchema` |
| 4 | `lib/brand/ai/recommendations.ts` | `generateBrandRecommendations()` | `claude-opus-5` | **Groq** | `RecommendationsOutputSchema` |
| 5 | `lib/leads/ai/rewrite.ts` | `rewriteMessage()` | `claude-sonnet-5` | **Gemini** | `RewriteSchema` |
| 6 | `lib/brand/ai/script.ts` | `generateScriptFromIdea()` | `claude-sonnet-5` | **Gemini** | `ScriptSchema` |
| 7 | `lib/brand/ai/outlier-idea.ts` | `generateIdeaFromOutlier()` | `claude-sonnet-5` | **Gemini** | `OutlierIdeaSchema` |

Fuera de alcance (Etapa 2, sigue en Anthropic): `lib/brand/ai/chat.ts` — tool-use en loop (5 tools propias + `web_search` server tool) con streaming a `brand_chat_messages`.

## `lib/groq/client.ts` (nuevo)

Hand-rolled, sin SDK — mismo estilo que `lib/gemini/client.ts` y `lib/windsor/client.ts` (la convención del repo para proveedores free-tier). API de Groq: compatible con OpenAI Chat Completions (`POST https://api.groq.com/openai/v1/chat/completions`, Bearer, `response_format`, streaming SSE — no usado acá, Etapa 1 es sin streaming).

```ts
const GROQ_BASE = "https://api.groq.com/openai/v1/chat/completions";

/** Confirmar en console.groq.com/docs/models antes de asumir que sigue vigente — el catálogo free de Groq rota. */
export const GROQ_MODEL = "openai/gpt-oss-120b";

export type GroqJsonSchema = Record<string, unknown>;

export interface GroqJsonParams {
  apiKey: string;
  system: string;
  prompt: string;
  schema: GroqJsonSchema;
  /** Groq lo exige en response_format.json_schema.name. */
  schemaName: string;
  /** true (default): constrained decoding real — exige additionalProperties:false y TODO en required. false: "best-effort", para shapes con diccionario abierto (ver recommendations.ts). */
  strict?: boolean;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Igual contrato que generateGeminiJson: devuelve texto crudo sin parsear — lo valida quien llama, con Zod (CLAUDE.md §5). */
export async function generateGroqJson(params: GroqJsonParams): Promise<string> {
  const response = await fetch(GROQ_BASE, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify({
      model: params.model ?? GROQ_MODEL,
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: params.schemaName, strict: params.strict ?? true, schema: params.schema },
      },
      temperature: params.temperature ?? 0,
      max_tokens: params.maxTokens ?? 4000,
    }),
  });
  if (!response.ok) throw new Error(`Groq rechazó la consulta (${await groqErrorMessage(response)})`);
  const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text.trim()) throw new Error("Groq devolvió una respuesta vacía.");
  return text;
}
```

**Por qué no hay un helper que "traduzca" el Zod schema a texto de prompt** (que era la pregunta original): con `strict:true`, Groq hace *constrained decoding* real — la forma queda tan garantizada como con `responseSchema` de Gemini. La forma de cada llamado se escribe a mano como `GroqJsonSchema`/`GeminiSchema`, igual que ya hace `GEMINI_SCHEMA` en `lib/leads/ai/enrich.ts` (no derivado del Zod schema). Duplicación aceptada a propósito, mismo riesgo que ya existe hoy con Gemini, mitigado poniendo ambos schemas uno junto al otro en el mismo archivo.

**Excepción:** `recommendations.ts` tiene `metrics: Record<string, number|string>` (diccionario de claves abiertas) — no entra en modo `strict`. Ese único call site usa `strict: false`.

## Retry compartido: `lib/ai/structured-output.ts` (nuevo)

Ni Groq ni Gemini tienen el chequeo nativo que Anthropic hacía en `messages.parse()` (`"Failed to parse structured output"`). Reemplazo genérico, sin nada de proveedor ni dominio:

```ts
export async function resolveStructuredJson<T>(
  schema: z.ZodType<T>,
  attempt: (repairNote: string | null) => Promise<string>,
): Promise<T> {
  const tryOnce = async (repairNote: string | null): Promise<T> => {
    const raw = await attempt(repairNote);
    let json: unknown;
    try { json = JSON.parse(raw); }
    catch (error) { throw new Error(`el modelo no devolvió JSON válido (${error instanceof Error ? error.message : "sin detalle"})`); }
    return schema.parse(json);
  };
  try { return await tryOnce(null); }
  catch (firstError) {
    const detail = firstError instanceof Error ? firstError.message : String(firstError);
    return tryOnce(`Tu respuesta anterior no era válida: ${detail}. Devolvé de nuevo el JSON completo, corrigiendo eso, sin texto extra ni explicación.`);
  }
}
```

Se usa en los 7 call sites, incluidos `script.ts`/`outlier-idea.ts` que hoy no reintentan nada — mejora deliberada, no paridad estricta: un modelo gratis sin chequeo nativo falla más seguido, y el reintento es gratis.

## Conversión de schemas

**A `GeminiSchema` (rewrite, script, outlier-idea)** — van junto a su Zod schema respectivo (`lib/leads/ai/schemas.ts` para rewrite; inline en `script.ts`/`outlier-idea.ts`, que no tienen un `schemas.ts` centralizado). Directo: `type`, `properties`, `required`, `enum` donde corresponda — sin `maxLength`/`maxItems` (esos límites de negocio los sigue validando Zod después, igual que ya hace `enrich.ts`).

**A `GroqJsonSchema` (analyze, opening, follow-up, recommendations)** — la diferencia clave del modo `strict`: un campo `.nullable()` de Zod no puede quedar "opcional", tiene que estar en `required` igual, con `type: ["string", "null"]`. El caso más profundo es `AnalyzeOutputSchema` (4 sub-objetos, uno con array de hasta 6 sub-objetos anidados) — se escribe completo, con `additionalProperties: false` en cada nivel. Los otros tres son más chicos y siguen el mismo patrón.

## Diffs por archivo (los 7 call sites)

Cambio estructural común a los 4 que van a Groq: el mensaje `{role: "system"}` que Anthropic mandaba *después* del turno de usuario (sólo para el bloque de estado variable) no tiene equivalente en la interfaz de dos roles de Groq/Gemini — se concatena al final del `prompt` de usuario con un separador. No cambia nada de fondo: ese bloque nunca estuvo dentro del `cache_control` cacheado.

Sobre el `cache_control: ephemeral` de Anthropic: sin equivalente en ninguno de los dos clientes hand-rolled. Cada llamada reenvía el Sistema de Prospección (~14 KB) o el Sistema de Contenido (~20 KB) completo. En costo no importa (free tier); en cuota de tokens-por-minuto sí — ver Riesgos.

- **`analyze.ts`, `opening.ts`, `follow-up.ts`**: quitar `Anthropic`/`zodOutputFormat`/`createAnthropicClient`/`thinking`/`effort` (sin reemplazo, trade-off ya aceptado). Agregar `generateGroqJson`, `resolveStructuredJson`, el `*_GROQ_SCHEMA` correspondiente. El resto de cada función (construcción de `stateBlock`/`angleBlock`, tipos de retorno) no cambia.
- **`rewrite.ts`** (→ Gemini): el más simple, un solo mensaje sin bloque de estado. Mapea directo a `generateGeminiJson(...)`.
- **`recommendations.ts`** (→ Groq, `strict:false`): **bajar `max_tokens` de 16000 a ~4000–6000** (ver Riesgos) — puede forzar recortar cuántas recomendaciones pide `buildRecommendationsUserPrompt`; confirmar en la verificación manual si el recorte es aceptable.
- **`script.ts`, `outlier-idea.ts`** (→ Gemini): mismo patrón que `rewrite.ts`, `maxOutputTokens: 8000` sin cambios.

## Plomería de Configuración

- `lib/settings/constants.ts`: nuevo `GROQ_KEY_SETTING = "groq_api_key"`.
- `lib/settings/actions.ts`: `saveGroqKey`/`deleteGroqKey`/`testGroqConnection`, copia del trío de Gemini; el test manda un `generateGroqJson` trivial (`{"ok": true}`).
- `lib/settings/queries.ts`: `getGroqKeyStatus()`.
- `components/settings/groq-key-form.tsx` (nuevo): copia de `gemini-key-form.tsx`, placeholder `gsk_••••`.
- `app/(app)/configuracion/page.tsx`: nueva Card de Groq. **Actualizar las descripciones de las Cards de Anthropic y Gemini**, que hoy están desactualizadas incluso antes de este cambio (Anthropic dice que es sólo de Marca; Gemini dice que sin ella "la pantalla funciona igual" — ya no, sin Gemini fallan reescrituras/guiones/ideas).
- `lib/leads/ai/key.ts`: agregar `getGroqApiKey()` (mismo `getDecryptedKey` ya existente). `getAnthropicApiKey` se deja en el archivo aunque quede sin llamadores dentro de leads (ver Riesgos).
- `lib/brand/ai/key.ts`: agregar `getGeminiApiKey()` y `getGroqApiKey()`. `getAnthropicApiKey` se mantiene intacta (la sigue usando `chat.ts`).
- Actualizar los 5 call sites en `lib/leads/ai/actions.ts`, `lib/brand/actions.ts` (más el catch de errores de Anthropic ahí, líneas ~84-91), `lib/brand/planner/actions.ts`, `lib/brand/trends/actions.ts`, `lib/brand/competitors/actions.ts` para pedir la key nueva en vez de la de Anthropic. **No tocar** las lecturas inline de Gemini para relevancia de competencia/tendencias (§3.14, feature distinta) ni `sendBrandChatMessage` en `lib/brand/actions.ts` (Etapa 2).

**Sin cambios en** `next.config.ts` (los `.md` se siguen leyendo igual, sin importar qué proveedor consuma el texto) **ni en `package.json`** (sin SDK nuevo, mismo criterio que Gemini/Windsor).

## Verificación

Ya no es "no gastar plata" (todo es free tier) sino no pisar el límite de *requests* por minuto/día mientras se prueba. Orden sugerido, uno por vez, con confirmación item por item (CLAUDE.md §13):

1. Configuración → cargar la key de Groq → "Probar conexión" primero (valida `GROQ_MODEL` antes de tocar cualquier pantalla).
2. `rewriteMessage` (Gemini) — el más simple, sirve de humo.
3. `generateFollowup` (Groq) — esquema chico, sin array anidado.
4. `generateOpening` (Groq).
5. `analyzeLeadResponse` (Groq) — pegar una respuesta real de un lead de prueba y revisar cada campo a mano contra lo que diría una persona; es el de mayor riesgo de *calidad* (no de sintaxis).
6. `generateScriptFromIdea` / `generateIdeaFromOutlier` (Gemini), uno por pantalla.
7. `generateBrandRecommendations` (Groq) — probarlo solo, no en la misma sesión que un lote de enriquecimiento de leads (comparte cuota de Gemini) ni justo después de varias pruebas de los pasos 2-6, para no confundir un 429 real con un bug de parseo.

Para cada uno: confirmar que el mensaje de error, si falla, ya no menciona a Claude, y que el JSON no necesitó el reintento de reparación en el uso normal.

## Riesgos a tener presentes

- **Confirmado en la verificación manual (2026-09-27), ya resuelto en código:** `openai/gpt-oss-120b` es un modelo de razonamiento — gasta tokens de razonamiento oculto (nunca visible, ni para el usuario ni en el `content` de la respuesta) del mismo presupuesto de `max_tokens` **antes** de escribir el JSON. Con un `maxTokens` bajo (el test de conexión pedía 32), el razonamiento agota el presupuesto y Groq corta la generación a mitad del JSON, devolviendo `Failed to validate JSON. Please adjust your prompt.` aunque el schema esté bien. Fix en `lib/groq/client.ts`: se manda `reasoning_effort: "low"` por default en cualquier llamado a un modelo `openai/gpt-oss-*` (el parámetro no lo soportan otros modelos, así que va condicional al nombre) y se subió el `maxTokens` del test de conexión a 300. Fuente: `console.groq.com/docs/reasoning` + reportes de la comunidad de Groq sobre el mismo error con gpt-oss. Si un call site real (no el test) sigue fallando así, subir su `maxTokens` es el primer paso, no bajar el `reasoning_effort` más de lo que ya está.
- **Sin verificar (ver Contexto): si Groq realmente sacó Llama 3 del free tier.** Confirmar en tu cuenta antes de correr nada; cambiar `GROQ_MODEL` es una línea.
- **Cuota de tokens por minuto de Groq, más ajustada de lo que "$0" sugiere** (cifras de terceros, no oficiales — confirmar en `console.groq.com/settings/limits`): reenviar el Sistema de Prospección/Contenido completo en cada llamada (sin caché) puede acercarse al límite por minuto en una sola corrida, especialmente en `recommendations.ts` con `max_tokens` alto — de ahí la baja recomendada.
- **Calidad real de `gpt-oss-120b` contra Claude Opus** para el juicio fino de `analyze.ts` — no medible sin probarlo con conversaciones reales (paso 5 de verificación). Trade-off ya aceptado por el usuario.
- **Cuota de Gemini compartida** entre el enriquecimiento de leads (ya la usa) y las 3 funciones nuevas — sin throttle centralizado hoy; si aparecen 429 en la práctica, es trabajo nuevo a evaluar después, no resuelto en este plan.
- **Código que queda sin llamadores tras esto** (no se borra en este plan, sólo para que no se lea como descuido): `lib/leads/ai/client.ts` y `getAnthropicApiKey` de `lib/leads/ai/key.ts` — candidatos a limpieza en un commit aparte, después de verificar Etapa 1.

## Archivos críticos

- `lib/groq/client.ts` (nuevo)
- `lib/ai/structured-output.ts` (nuevo)
- `lib/leads/ai/schemas.ts` (sumar 4 schemas Groq + 1 Gemini)
- `lib/leads/ai/{analyze,opening,follow-up,rewrite}.ts`
- `lib/brand/ai/{recommendations,script,outlier-idea}.ts`
- `lib/settings/{constants,actions,queries}.ts`, `components/settings/groq-key-form.tsx`, `app/(app)/configuracion/page.tsx`
- `lib/leads/ai/key.ts`, `lib/brand/ai/key.ts`
- `lib/leads/ai/actions.ts`, `lib/brand/actions.ts`, `lib/brand/planner/actions.ts`, `lib/brand/trends/actions.ts`, `lib/brand/competitors/actions.ts`
