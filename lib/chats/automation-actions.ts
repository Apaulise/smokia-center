"use server";

// Acciones del servidor de §1.26 sub-paso 4: elegir los modelos TOFU/MOFU,
// clonarlos por pieza (workflow + automatización de comentario) y
// pausar/reanudar/borrar lo que ya se creó. Todo con el cliente con RLS del
// dueño de la cuenta: las automatizaciones son suyas, no se comparten por
// equipo (CLAUDE.md §4, no es una de las excepciones).

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { asChats, type AutomationStage, type ChatsClient, type ContentAutomationRow } from "@/lib/chats/db";
import { buildCommentAutomationBody, cloneWorkflowGraph, findKeywordConflicts, keywordVariants, tagsInWorkflow } from "@/lib/chats/automations";
import {
  activateWorkflow,
  createCommentAutomation,
  createWorkflow,
  deleteCommentAutomation,
  deleteWorkflow,
  describeZernioError,
  getDefaultProfileId,
  getWorkflow,
  listCommentAutomations,
  listRecentPosts,
  listWorkflows,
  pauseWorkflow,
  recordId,
  updateCommentAutomation,
  type RawRecord,
} from "@/lib/chats/zernio";
import { decrypt } from "@/lib/crypto";
import { createClient, requireUser } from "@/lib/supabase/server";

export type AutomationActionResult = { ok: boolean; message: string };

const PATH = "/leads/chats/automatizaciones";

function missingTable(error: { code?: string; message?: string } | null): boolean {
  return Boolean(error && (error.code === "PGRST205" || error.code === "42P01" || /Could not find the table|does not exist/i.test(error.message ?? "")));
}

/** La cuenta de Instagram del dueño logueado, con su API key ya descifrada. */
async function ownedAccountWithKey(chats: ChatsClient, userId: string) {
  const { data: account } = await chats
    .from("channel_accounts")
    .select("id, owner_id, zernio_account_id, handle, status")
    .eq("owner_id", userId)
    .eq("channel", "INSTAGRAM")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!account) return null;
  const { data: secret } = await chats.from("channel_secrets").select("api_key_encrypted").eq("channel_account_id", account.id).maybeSingle();
  if (!secret) return null;
  try {
    return { account, apiKey: decrypt(secret.api_key_encrypted) };
  } catch {
    return null;
  }
}

// ── Modelos ──────────────────────────────────────────────────────────────────

export type ModelCandidate = { id: string; name: string; status: string; createdAt: string | null };
export type TemplateView = { stage: AutomationStage; workflowId: string; name: string; tags: string[]; confirmMessage: string | null; ready: boolean };

/**
 * Pantalla "Modelos": los workflows en borrador o pausados de la cuenta (los
 * candidatos a molde) y los que ya están elegidos como TOFU/MOFU.
 */
export async function loadAutomationSetup(): Promise<{
  ready: boolean;
  accountReady: boolean;
  candidates: ModelCandidate[];
  templates: Partial<Record<AutomationStage, TemplateView>>;
}> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const found = await ownedAccountWithKey(chats, user.id);
  if (!found) return { ready: true, accountReady: false, candidates: [], templates: {} };

  const { data: rows, error } = await chats.from("chat_automation_templates").select("*").eq("owner_id", user.id).eq("channel_account_id", found.account.id);
  if (error && !missingTable(error)) return { ready: true, accountReady: true, candidates: [], templates: {} };

  let candidates: ModelCandidate[] = [];
  try {
    const workflows = await listWorkflows(found.apiKey);
    candidates = workflows
      .filter((workflow) => workflow.status !== "active")
      .map((workflow) => ({ id: recordId(workflow), name: typeof workflow.name === "string" ? workflow.name : "Sin nombre", status: String(workflow.status ?? "draft"), createdAt: typeof workflow.createdAt === "string" ? workflow.createdAt : null }))
      .filter((workflow) => workflow.id);
  } catch {
    candidates = [];
  }

  const templates: Partial<Record<AutomationStage, TemplateView>> = {};
  for (const row of (rows ?? []) as Array<{ stage: AutomationStage; zernio_workflow_id: string | null; name: string; tags: string[]; confirm_message: string | null }>) {
    if (!row.zernio_workflow_id) continue;
    templates[row.stage] = { stage: row.stage, workflowId: row.zernio_workflow_id, name: row.name, tags: row.tags ?? [], confirmMessage: row.confirm_message, ready: true };
  }

  return { ready: !missingTable(error), accountReady: true, candidates, templates };
}

const chooseModelSchema = z.object({ stage: z.enum(["TOFU", "MOFU"]), workflowId: z.string().trim().min(10).max(64) });

/** Elige (o cambia) cuál workflow es el molde TOFU o MOFU. Lo lee de Zernio para guardar su nombre y sus etiquetas. */
export async function chooseAutomationModel(input: { stage: "TOFU" | "MOFU"; workflowId: string }): Promise<AutomationActionResult> {
  const user = await requireUser();
  const parsed = chooseModelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Datos inválidos." };

  const chats = asChats(await createClient());
  const found = await ownedAccountWithKey(chats, user.id);
  if (!found) return { ok: false, message: "Conectá primero tu cuenta de Instagram en Configuración." };

  let workflow: RawRecord;
  try {
    workflow = await getWorkflow(found.apiKey, parsed.data.workflowId);
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }
  const nodes = Array.isArray(workflow.nodes) ? (workflow.nodes as RawRecord[]) : [];

  const { error } = await chats.from("chat_automation_templates").upsert(
    {
      owner_id: user.id,
      channel_account_id: found.account.id,
      stage: parsed.data.stage,
      zernio_workflow_id: parsed.data.workflowId,
      zernio_comment_automation_id: null,
      name: typeof workflow.name === "string" ? workflow.name : "Sin nombre",
      tags: tagsInWorkflow(nodes),
    },
    { onConflict: "owner_id,channel_account_id,stage" },
  );
  if (error) return { ok: false, message: missingTable(error) ? "Falta aplicar la migración de automatizaciones." : "No se pudo guardar el molde." };
  revalidatePath(PATH);
  return { ok: true, message: `Molde ${parsed.data.stage} guardado.` };
}

const confirmMessageSchema = z.object({ stage: z.enum(["TOFU", "MOFU"]), message: z.string().trim().max(640) });

export async function setModelConfirmMessage(input: { stage: "TOFU" | "MOFU"; message: string }): Promise<AutomationActionResult> {
  const user = await requireUser();
  const parsed = confirmMessageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Texto inválido (hasta 640 caracteres)." };
  const chats = asChats(await createClient());
  const { error } = await chats.from("chat_automation_templates").update({ confirm_message: parsed.data.message || null }).eq("owner_id", user.id).eq("stage", parsed.data.stage);
  if (error) return { ok: false, message: "No se pudo guardar." };
  revalidatePath(PATH);
  return { ok: true, message: "Guardado." };
}

// ── Elegir la pieza ──────────────────────────────────────────────────────────

export type PostCandidate = { platformPostId: string; permalink: string | null; caption: string | null; commentCount: number; likeCount: number };

export async function listRecentPostsForAssign(): Promise<{ ready: boolean; posts: PostCandidate[] }> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const found = await ownedAccountWithKey(chats, user.id);
  if (!found) return { ready: false, posts: [] };
  try {
    const posts = await listRecentPosts(found.apiKey, found.account.zernio_account_id, 30);
    return { ready: true, posts: posts.map((post) => ({ platformPostId: post.platformPostId, permalink: post.permalink, caption: post.caption, commentCount: post.commentCount, likeCount: post.likeCount })) };
  } catch {
    return { ready: true, posts: [] };
  }
}

const previewSchema = z.object({
  stage: z.enum(["TOFU", "MOFU"]),
  keyword: z.string().trim().min(2).max(40),
  resourceUrl: z.url().max(600),
  resourceTitle: z.string().trim().min(1).max(80),
});

/** Vista previa del primer DM (el de la automatización de comentario), sin crear nada. */
export async function previewAutomationCopy(input: { stage: "TOFU" | "MOFU"; keyword: string; resourceUrl: string; resourceTitle: string }): Promise<{ ok: true; text: string; buttonTitle: string } | { ok: false; message: string }> {
  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const user = await requireUser();
  const chats = asChats(await createClient());
  const { data: template } = await chats.from("chat_automation_templates").select("confirm_message").eq("owner_id", user.id).eq("stage", parsed.data.stage).maybeSingle();
  const body = buildCommentAutomationBody({
    profileId: "preview",
    accountId: "preview",
    name: "preview",
    platformPostId: "preview",
    postTitle: null,
    keywords: [],
    workflowId: "preview",
    confirmMessage: template?.confirm_message ?? null,
    values: { resourceUrl: parsed.data.resourceUrl, resourceTitle: parsed.data.resourceTitle, keyword: parsed.data.keyword.trim().toLowerCase() },
  });
  return { ok: true, text: String(body.dmMessage), buttonTitle: (body.buttons as Array<{ title: string }>)[0]?.title ?? "" };
}

const assignSchema = z.object({
  stage: z.enum(["TOFU", "MOFU"]),
  platformPostId: z.string().trim().min(3).max(64),
  postCaption: z.string().trim().max(2200).nullable(),
  permalink: z.url().max(600).nullable(),
  keyword: z
    .string()
    .trim()
    .min(2, "La palabra clave tiene que tener al menos 2 letras.")
    .max(40)
    .regex(/^[\p{L}0-9 ]+$/u, "Sólo letras, números y espacios."),
  resourceUrl: z.url("Pegá un link válido, con https://."),
  resourceTitle: z.string().trim().min(1, "Ponele un nombre al recurso.").max(80),
  manyChatOff: z.literal(true, { error: "Confirmá que apagaste la automatización de ManyChat de este reel." }),
});

/**
 * Clona el molde elegido para una pieza nueva: primero el workflow (con los
 * marcadores reemplazados y las etiquetas de etapa/palabra insertadas),
 * después la automatización de comentario que lo dispara. Si algo falla a
 * mitad de camino, borra lo que alcanzó a crear.
 */
export async function createContentAutomation(input: {
  stage: "TOFU" | "MOFU";
  platformPostId: string;
  postCaption: string | null;
  permalink: string | null;
  keyword: string;
  resourceUrl: string;
  resourceTitle: string;
  manyChatOff: boolean;
}): Promise<AutomationActionResult> {
  const user = await requireUser();
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { stage, platformPostId, postCaption, permalink, resourceUrl, resourceTitle } = parsed.data;
  const keyword = parsed.data.keyword.toLowerCase();

  const chats = asChats(await createClient());
  const found = await ownedAccountWithKey(chats, user.id);
  if (!found) return { ok: false, message: "Conectá primero tu cuenta de Instagram en Configuración." };
  if (found.account.status !== "ACTIVA") return { ok: false, message: "La cuenta de Instagram está desconectada: reconectala en Zernio antes de activar una automatización." };

  const { data: existingAutomation } = await chats.from("content_automations").select("id").eq("owner_id", user.id).eq("platform_post_id", platformPostId).maybeSingle();
  if (existingAutomation) return { ok: false, message: "Esta pieza ya tiene una automatización. Borrala primero si querés rehacerla." };

  const { data: template } = await chats.from("chat_automation_templates").select("*").eq("owner_id", user.id).eq("channel_account_id", found.account.id).eq("stage", stage).maybeSingle();
  if (!template?.zernio_workflow_id) return { ok: false, message: `Todavía no elegiste el molde ${stage}. Hacelo en "Modelos" primero.` };

  let profileId: string;
  let modelWorkflow: RawRecord;
  let existingAutomations: RawRecord[];
  try {
    [profileId, modelWorkflow, existingAutomations] = await Promise.all([getDefaultProfileId(found.apiKey), getWorkflow(found.apiKey, template.zernio_workflow_id), listCommentAutomations(found.apiKey)]);
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }

  const conflicts = findKeywordConflicts(existingAutomations, platformPostId, keyword);
  if (conflicts.some((conflict) => conflict.scope === "mismo_post")) {
    return { ok: false, message: "Ya hay otra automatización activa con esa palabra en este mismo post." };
  }

  const values = { resourceUrl, resourceTitle, keyword };
  const uniqueSuffix = randomUUID().replace(/-/g, "").slice(0, 10);
  const nodes = Array.isArray(modelWorkflow.nodes) ? (modelWorkflow.nodes as RawRecord[]) : [];
  const edges = Array.isArray(modelWorkflow.edges) ? (modelWorkflow.edges as RawRecord[]) : [];
  const cloned = cloneWorkflowGraph({ nodes, edges }, { ...values, stage, uniqueSuffix });

  let workflowId: string;
  try {
    const created = await createWorkflow(found.apiKey, {
      profileId,
      accountId: found.account.zernio_account_id,
      platform: "instagram",
      name: `ALTAB · ${stage} · ${keyword} · ${new Date().toISOString().slice(0, 10)}`,
      description: `Clonado del molde ${stage} para la pieza ${platformPostId} (palabra "${keyword}"). Creado desde ALTAB, §1.26 sub-paso 4.`,
      nodes: cloned.nodes,
      edges: cloned.edges,
      entryNodeId: cloned.entryNodeId,
    });
    workflowId = recordId(created);
    await activateWorkflow(found.apiKey, workflowId);
  } catch (error) {
    return { ok: false, message: `No se pudo crear el workflow en Zernio. ${describeZernioError(error)}` };
  }

  let automationId: string;
  try {
    const body = buildCommentAutomationBody({
      profileId,
      accountId: found.account.zernio_account_id,
      name: `ALTAB · ${stage} · ${keyword}`,
      platformPostId,
      postTitle: postCaption ? postCaption.slice(0, 120) : null,
      keywords: keywordVariants(keyword),
      workflowId,
      confirmMessage: template.confirm_message,
      values,
    });
    const created = await createCommentAutomation(found.apiKey, body);
    automationId = recordId(created);
  } catch (error) {
    // El workflow ya se creó y activó: si la automatización falla, no queda huérfano respondiendo solo.
    await pauseWorkflow(found.apiKey, workflowId).catch(() => {});
    await deleteWorkflow(found.apiKey, workflowId).catch(() => {});
    return { ok: false, message: `No se pudo crear la automatización de comentario. ${describeZernioError(error)}` };
  }

  const { error: insertError } = await chats.from("content_automations").insert({
    owner_id: user.id,
    channel_account_id: found.account.id,
    template_id: template.id,
    stage,
    platform_post_id: platformPostId,
    post_caption: postCaption,
    permalink,
    keywords: keywordVariants(keyword),
    resource_url: resourceUrl,
    resource_title: resourceTitle,
    zernio_comment_automation_id: automationId,
    zernio_workflow_id: workflowId,
    status: "ACTIVA",
  });
  if (insertError) {
    // Ya quedó funcionando en Zernio; sólo falló guardar el registro acá. Se avisa en vez de desarmar lo que ya anda.
    revalidatePath(PATH);
    return { ok: true, message: "Se creó y activó en Zernio, pero no se pudo guardar en ALTAB. Avisá para revisarlo a mano." };
  }

  revalidatePath(PATH);
  const warn = conflicts.length > 0 ? ` Ojo: "${conflicts[0].name}" también usa "${keyword}" en otro post — revisá que no se pisen.` : "";
  return { ok: true, message: `Automatización creada y activa.${warn}` };
}

// ── Lista, pausar/reanudar, borrar ──────────────────────────────────────────

export type ContentAutomationView = ContentAutomationRow & { started: number; completed: number; failed: number };

export async function listContentAutomations(): Promise<{ ready: boolean; items: ContentAutomationView[] }> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const { data: rows, error } = await chats.from("content_automations").select("*").eq("owner_id", user.id).order("created_at", { ascending: false });
  if (error) return { ready: !missingTable(error), items: [] };

  const automations = (rows ?? []) as ContentAutomationRow[];
  const ids = automations.map((row) => row.id);
  const counts = new Map<string, { started: number; completed: number; failed: number }>();
  if (ids.length > 0) {
    const { data: runs } = await chats.from("automation_runs").select("automation_id, status").eq("owner_id", user.id).in("automation_id", ids);
    for (const run of runs ?? []) {
      const entry = counts.get(run.automation_id) ?? { started: 0, completed: 0, failed: 0 };
      if (run.status === "completed") entry.completed += 1;
      else if (run.status === "failed") entry.failed += 1;
      else entry.started += 1;
      counts.set(run.automation_id, entry);
    }
  }
  return { ready: true, items: automations.map((row) => ({ ...row, ...(counts.get(row.id) ?? { started: 0, completed: 0, failed: 0 }) })) };
}

async function ownedAutomation(chats: ChatsClient, userId: string, id: string) {
  const { data } = await chats.from("content_automations").select("*").eq("id", id).eq("owner_id", userId).maybeSingle();
  if (!data) return null;
  const found = await ownedAccountWithKey(chats, userId);
  if (!found || found.account.id !== data.channel_account_id) return null;
  return { row: data as ContentAutomationRow, apiKey: found.apiKey };
}

export async function pauseContentAutomation(id: string): Promise<AutomationActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const found = await ownedAutomation(chats, user.id, id);
  if (!found) return { ok: false, message: "No se encontró la automatización." };
  try {
    if (found.row.zernio_workflow_id) await pauseWorkflow(found.apiKey, found.row.zernio_workflow_id);
    if (found.row.zernio_comment_automation_id) await updateCommentAutomation(found.apiKey, found.row.zernio_comment_automation_id, { isActive: false });
  } catch (error) {
    return { ok: false, message: describeZernioError(error) };
  }
  await chats.from("content_automations").update({ status: "PAUSADA", error: null }).eq("id", id).eq("owner_id", user.id);
  revalidatePath(PATH);
  return { ok: true, message: "Pausada." };
}

export async function resumeContentAutomation(id: string): Promise<AutomationActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const found = await ownedAutomation(chats, user.id, id);
  if (!found) return { ok: false, message: "No se encontró la automatización." };
  try {
    if (found.row.zernio_workflow_id) await activateWorkflow(found.apiKey, found.row.zernio_workflow_id);
    if (found.row.zernio_comment_automation_id) await updateCommentAutomation(found.apiKey, found.row.zernio_comment_automation_id, { isActive: true });
  } catch (error) {
    await chats.from("content_automations").update({ status: "ERROR", error: describeZernioError(error) }).eq("id", id).eq("owner_id", user.id);
    revalidatePath(PATH);
    return { ok: false, message: describeZernioError(error) };
  }
  await chats.from("content_automations").update({ status: "ACTIVA", error: null }).eq("id", id).eq("owner_id", user.id);
  revalidatePath(PATH);
  return { ok: true, message: "Reanudada." };
}

export async function deleteContentAutomation(id: string): Promise<AutomationActionResult> {
  const user = await requireUser();
  const chats = asChats(await createClient());
  const found = await ownedAutomation(chats, user.id, id);
  if (!found) return { ok: false, message: "No se encontró la automatización." };
  if (found.row.zernio_comment_automation_id) await deleteCommentAutomation(found.apiKey, found.row.zernio_comment_automation_id).catch(() => {});
  if (found.row.zernio_workflow_id) await deleteWorkflow(found.apiKey, found.row.zernio_workflow_id).catch(() => {});
  await chats.from("content_automations").delete().eq("id", id).eq("owner_id", user.id);
  revalidatePath(PATH);
  return { ok: true, message: "Borrada en Zernio y en ALTAB." };
}
