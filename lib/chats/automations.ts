// Clonado puro de los modelos TOFU/MOFU (§1.26 sub-paso 4): reemplazar los
// marcadores [[RECURSO]], [[TITULO]] y [[PALABRA]] en el grafo de un workflow
// y armar el cuerpo de la automatización de comentario que lo dispara. Sin
// red ni base — lib/chats/automation-actions.ts hace las llamadas de verdad.
// (tests/chats-automations.test.mjs)

import type { RawRecord } from "@/lib/chats/zernio";

export const MARKER_RESOURCE = "[[RECURSO]]";
export const MARKER_TITLE = "[[TITULO]]";
export const MARKER_KEYWORD = "[[PALABRA]]";

export type MarkerValues = { resourceUrl: string; resourceTitle: string; keyword: string };

function replaceMarkers(text: string, values: MarkerValues): string {
  return text.split(MARKER_RESOURCE).join(values.resourceUrl).split(MARKER_TITLE).join(values.resourceTitle).split(MARKER_KEYWORD).join(values.keyword);
}

/** Recorre nodos/edges (o cualquier estructura que haya devuelto Zernio) reemplazando los marcadores en cada string. */
export function replaceMarkersDeep<T>(value: T, values: MarkerValues): T {
  if (typeof value === "string") return replaceMarkers(value, values) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => replaceMarkersDeep(item, values)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = replaceMarkersDeep(item, values);
    return out as T;
  }
  return value;
}

const MARKER_PATTERN = /\[\[(RECURSO|TITULO|PALABRA)\]\]/;

/** ¿Queda algún marcador sin reemplazar? Para avisar si el molde está incompleto antes de clonarlo. */
export function hasUnresolvedMarkers(value: unknown): boolean {
  if (typeof value === "string") return MARKER_PATTERN.test(value);
  if (Array.isArray(value)) return value.some((item) => hasUnresolvedMarkers(item));
  if (value && typeof value === "object") return Object.values(value as Record<string, unknown>).some((item) => hasUnresolvedMarkers(item));
  return false;
}

/** Las 3 variantes de palabra que entiende el `matchMode: "word"` de Zernio (tal cual, Capitalizada, MAYÚSCULA), sin repetir. */
export function keywordVariants(keyword: string): string[] {
  const trimmed = keyword.trim();
  if (!trimmed) return [];
  const capitalized = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  return [...new Set([trimmed, capitalized, trimmed.toUpperCase()])];
}

/** Las etiquetas (`add_tag`) que pone un workflow, leyendo sus nodos. Para mostrar qué etiqueta cada molde. */
export function tagsInWorkflow(nodes: RawRecord[]): string[] {
  const tags: string[] = [];
  for (const node of nodes) {
    if (node.type !== "add_tag") continue;
    const config = node.config && typeof node.config === "object" ? (node.config as RawRecord) : {};
    if (typeof config.tag === "string" && config.tag) tags.push(config.tag);
  }
  return [...new Set(tags)];
}

export type ClonedWorkflow = { nodes: RawRecord[]; edges: RawRecord[]; entryNodeId: string; triggerKeyword: string };

/**
 * Clona el grafo de un molde: reemplaza los marcadores y le da al disparador
 * una palabra interna única que nunca va a matchear sola (en producción se
 * entra por el postback `zernio:workflow:<id>` de la automatización de
 * comentario de la pieza, que saltea esa condición). Justo después del
 * disparador inserta `add_tag` con la etapa y la palabra clave real, sin
 * tocar el resto del grafo.
 */
export function cloneWorkflowGraph(
  model: { nodes: RawRecord[]; edges: RawRecord[] },
  values: MarkerValues & { stage: "TOFU" | "MOFU"; uniqueSuffix: string },
): ClonedWorkflow {
  const nodes = replaceMarkersDeep(model.nodes, values);
  const edges = replaceMarkersDeep(model.edges, values);

  const trigger = nodes.find((node) => node.type === "trigger");
  if (!trigger || typeof trigger.id !== "string") throw new Error("El molde no tiene un disparador.");
  const triggerId = trigger.id;
  const triggerKeyword = `__smokia_${values.stage.toLowerCase()}_${values.uniqueSuffix}__`;
  const triggerConfig = trigger.config && typeof trigger.config === "object" ? (trigger.config as RawRecord) : {};
  trigger.config = { ...triggerConfig, triggerType: "inbound_message", keywords: [triggerKeyword], matchType: "exact" };

  const tagStageId = `n_tag_stage_${values.uniqueSuffix}`;
  const tagKeywordId = `n_tag_kw_${values.uniqueSuffix}`;
  const fromTrigger = edges.filter((edge) => edge.source === triggerId);
  const rest = edges.filter((edge) => edge.source !== triggerId);

  const insertedNodes: RawRecord[] = [
    { id: tagStageId, type: "add_tag", config: { tag: values.stage.toLowerCase() } },
    { id: tagKeywordId, type: "add_tag", config: { tag: `kw-${values.keyword}` } },
  ];
  const insertedEdges: RawRecord[] = [
    { id: `e_tag_stage_${values.uniqueSuffix}`, source: triggerId, target: tagStageId },
    { id: `e_tag_kw_${values.uniqueSuffix}`, source: tagStageId, target: tagKeywordId },
    ...fromTrigger.map((edge, index) => ({ ...edge, id: `e_tag_rest_${values.uniqueSuffix}_${index}`, source: tagKeywordId })),
  ];

  return { nodes: [...nodes, ...insertedNodes], edges: [...rest, ...insertedEdges], entryNodeId: triggerId, triggerKeyword };
}

const DEFAULT_CONFIRM_MESSAGE = "¡Genial que comentaste! Te paso [[TITULO]] por acá 👇";
const DEFAULT_CONFIRM_BUTTON = "Dale, pasámelo";
const DEFAULT_FOLLOW_MESSAGE = "Gracias por comentar. Para pasarte [[TITULO]], primero seguime y después tocá el botón de abajo.";
const DEFAULT_FOLLOW_BUTTON = "Ya te sigo";

export type CommentAutomationInput = {
  profileId: string;
  accountId: string;
  name: string;
  platformPostId: string;
  postTitle: string | null;
  keywords: string[];
  workflowId: string;
  confirmMessage: string | null;
  values: MarkerValues;
};

/**
 * El cuerpo para crear, por pieza, la automatización de comentario que
 * dispara el workflow ya clonado: palabra clave + post real, un DM corto de
 * confirmación con un botón que hace el handoff por postback, y el mismo
 * "seguime primero" que ya usan las automatizaciones existentes de la cuenta.
 */
export function buildCommentAutomationBody(input: CommentAutomationInput): RawRecord {
  return {
    profileId: input.profileId,
    accountId: input.accountId,
    name: input.name,
    platform: "instagram",
    trigger: "comment",
    platformPostId: input.platformPostId,
    postTitle: input.postTitle,
    keywords: input.keywords,
    matchMode: "word",
    dmMessage: replaceMarkers(input.confirmMessage?.trim() || DEFAULT_CONFIRM_MESSAGE, input.values),
    buttons: [{ type: "postback", title: DEFAULT_CONFIRM_BUTTON, payload: `zernio:workflow:${input.workflowId}` }],
    repeatPolicy: { mode: "every_comment", cooldownHours: 72 },
    publicReplyPolicy: "after_dm",
    audience: { followerStatus: "any", whenUnknown: "verify" },
    followGate: { message: replaceMarkers(DEFAULT_FOLLOW_MESSAGE, input.values), buttonLabel: DEFAULT_FOLLOW_BUTTON },
    isActive: true,
  };
}

export type KeywordConflict = { automationId: string; name: string; scope: "mismo_post" | "cualquier_post" };

/**
 * ¿Alguna automatización activa de la cuenta ya usa esta palabra? Bloquea si
 * es sobre el MISMO post (Zernio la rechazaría con 409 igual); avisa, sin
 * bloquear, si es una de cuenta entera (puede ser un resabio de ManyChat o de
 * otra pieza vieja con la misma palabra).
 */
export function findKeywordConflicts(existing: RawRecord[], platformPostId: string, keyword: string): KeywordConflict[] {
  const needle = keyword.trim().toLowerCase();
  if (!needle) return [];
  const conflicts: KeywordConflict[] = [];
  for (const automation of existing) {
    if (automation.isActive === false) continue;
    const keywords = Array.isArray(automation.keywords) ? (automation.keywords as unknown[]) : [];
    const matches = keywords.some((value) => typeof value === "string" && value.trim().toLowerCase() === needle);
    if (!matches) continue;
    const id = typeof automation.id === "string" ? automation.id : typeof automation._id === "string" ? (automation._id as string) : "";
    const name = typeof automation.name === "string" ? automation.name : "Automatización sin nombre";
    const samePost = automation.platformPostId === platformPostId;
    conflicts.push({ automationId: id, name, scope: samePost ? "mismo_post" : "cualquier_post" });
  }
  return conflicts;
}
