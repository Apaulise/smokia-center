"use server";

import { revalidatePath } from "next/cache";

import { getGeminiApiKey } from "@/lib/brand/ai/key";
import { generateScriptFromIdea } from "@/lib/brand/ai/script";
import { buildScriptContext } from "@/lib/brand/ai/script-context";
import { getBrandSource } from "@/lib/brand/sources/registry";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient, requireUser } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";
import { MetaApiError } from "@/lib/meta/client";

import { isPublishableKind, validateFileForKind, validateMediaForPublish, type MediaFile } from "./rules";
import {
  BRAND_MEDIA_BUCKET,
  CAPTION_MAX_CHARS,
  composeCaption,
  DEFAULT_SCHEDULE_TIME,
  KIND_LABEL,
  MediaFileSchema,
  normalizeHashtags,
  parseItemMedia,
  PlannerItemInput,
  PUBLISH_FROM_APP_ENABLED,
  ScriptFromIdeaInput,
} from "./schema";
import { postKindsFor } from "./link";

const PLANNER_PATH = "/marca/planificador";

/** Cuánto dura el candado de "publicando": si el proceso murió a la mitad, pasado esto se puede reintentar. */
const PUBLISH_LOCK_MINUTES = 10;

export type PlannerResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

/** Fecha y hora locales (Argentina, UTC-3 sin horario de verano) → instante UTC. */
function toInstant(date: string, time: string | null): string {
  return new Date(`${date}T${time ?? DEFAULT_SCHEDULE_TIME}:00-03:00`).toISOString();
}

const FIRST_ERROR = (error: { issues: { message: string }[] }) => error.issues[0]?.message ?? "Los datos no son válidos.";

/** Que la pieza referenciada exista y sea del usuario (RLS filtra por dueño) antes de guardar el vínculo. */
async function checkLinks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  itemId: string | null,
  links: { parentItemId: string | null; knowledgeId: string | null },
): Promise<string | null> {
  if (links.parentItemId) {
    if (links.parentItemId === itemId) return "Una pieza no puede descender de sí misma.";
    const { data: parent } = await supabase
      .from("brand_content_items")
      .select("id, parent_item_id")
      .eq("id", links.parentItemId)
      .maybeSingle();
    if (!parent) return "La pieza de la que se dice que desciende no existe.";
    if (itemId && parent.parent_item_id === itemId) return "Esa pieza ya desciende de ésta: el linaje daría una vuelta.";
  }
  if (links.knowledgeId) {
    const { data: note } = await supabase.from("brand_knowledge").select("id").eq("id", links.knowledgeId).maybeSingle();
    if (!note) return "La nota de conocimiento elegida no existe.";
  }
  return null;
}

/** Crea una pieza desde el planificador (clic en un día, o "Nueva pieza"). Los archivos se suben después, ya con su id. */
export async function createPlannerItem(platform: BrandPlatform, input: PlannerItemInput): Promise<PlannerResult<{ id: string }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const parsed = PlannerItemInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: FIRST_ERROR(parsed.error) };
  const data = parsed.data;

  const linkProblem = await checkLinks(supabase, null, data);
  if (linkProblem) return { ok: false, message: linkProblem };

  const { data: row, error } = await supabase
    .from("brand_content_items")
    .insert({
      owner_id: user.id,
      platform,
      kind: data.kind,
      status: data.status,
      title: data.title,
      objective: data.objective,
      hypothesis: data.hypothesis,
      hook: data.hook,
      angle: data.angle,
      idea: data.idea,
      script: data.script,
      caption: data.caption,
      hashtags: normalizeHashtags(data.hashtags),
      scheduled_for: data.scheduledDate ? toInstant(data.scheduledDate, data.scheduledTime) : null,
      parent_item_id: data.parentItemId,
      knowledge_id: data.knowledgeId,
    })
    .select("id")
    .single();

  if (error || !row) return { ok: false, message: "No se pudo crear la pieza." };
  revalidatePath(PLANNER_PATH);
  return { ok: true, id: row.id };
}

/** Guarda los cambios de una pieza. Una ya publicada conserva su estado, tipo y fecha: lo que se edita es la hipótesis y las notas. */
export async function updatePlannerItem(id: string, input: PlannerItemInput): Promise<PlannerResult> {
  await requireUser();
  const supabase = await createClient();

  const parsed = PlannerItemInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: FIRST_ERROR(parsed.error) };
  const data = parsed.data;

  const { data: current } = await supabase
    .from("brand_content_items")
    .select("status, media")
    .eq("id", id)
    .maybeSingle();
  if (!current) return { ok: false, message: "La pieza no existe." };
  const published = current.status === "PUBLICADO";

  const linkProblem = await checkLinks(supabase, id, data);
  if (linkProblem) return { ok: false, message: linkProblem };

  // Si cambia el tipo con archivos ya subidos, los archivos tienen que seguir sirviendo: rebotar acá
  // es mejor que descubrirlo recién al publicar.
  if (!published) {
    const media = parseItemMedia(current.media);
    if (media.length > 0 && isPublishableKind(data.kind)) {
      const problem = validateMediaForPublish(data.kind, media);
      if (problem) return { ok: false, message: `Los archivos subidos no sirven para un ${data.kind.toLowerCase()}: ${problem}` };
    }
  }

  const { error } = await supabase
    .from("brand_content_items")
    .update({
      title: data.title,
      objective: data.objective,
      hypothesis: data.hypothesis,
      hook: data.hook,
      angle: data.angle,
      idea: data.idea,
      script: data.script,
      caption: data.caption,
      hashtags: normalizeHashtags(data.hashtags),
      parent_item_id: data.parentItemId,
      knowledge_id: data.knowledgeId,
      ...(published
        ? {}
        : {
            kind: data.kind,
            status: data.status,
            scheduled_for: data.scheduledDate ? toInstant(data.scheduledDate, data.scheduledTime) : null,
          }),
    })
    .eq("id", id);

  if (error) return { ok: false, message: "No se pudo guardar la pieza." };
  revalidatePath(PLANNER_PATH);
  return { ok: true };
}

/**
 * "Generar guion": escribe el guion de la idea que está en el diálogo. No
 * guarda nada — devuelve el texto y el diálogo lo pone en el campo, para que
 * se lea, se corrija y recién ahí se guarde con el resto de la pieza.
 */
export async function generateItemScript(
  input: ScriptFromIdeaInput,
): Promise<PlannerResult<{ script: string; caveat: string | null }>> {
  await requireUser();

  const parsed = ScriptFromIdeaInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: FIRST_ERROR(parsed.error) };

  const keyResult = await getGeminiApiKey();
  if (!keyResult.ok) return { ok: false, message: keyResult.message };

  try {
    const generated = await generateScriptFromIdea({
      apiKey: keyResult.apiKey,
      ...parsed.data,
      ownContext: await buildScriptContext(),
    });
    return { ok: true, ...generated };
  } catch (error) {
    console.error("No se pudo generar el guion:", error instanceof Error ? error.message : error);
    return { ok: false, message: "No se pudo generar el guion. Probá de nuevo." };
  }
}

/** Arrastrar una pieza a otro día (o devolverla a "Sin fecha" con `dateIso = null`). Conserva la hora si viene. */
export async function movePlannerItem(id: string, dateIso: string | null, time: string | null): Promise<PlannerResult> {
  await requireUser();
  const supabase = await createClient();

  if (dateIso !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) return { ok: false, message: "Fecha inválida." };
  if (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) time = null;

  const { data: current } = await supabase.from("brand_content_items").select("status").eq("id", id).maybeSingle();
  if (!current) return { ok: false, message: "La pieza no existe." };
  if (current.status === "PUBLICADO") return { ok: false, message: "Una pieza publicada ya no se puede mover." };

  const { error } = await supabase
    .from("brand_content_items")
    .update({ scheduled_for: dateIso ? toInstant(dateIso, time) : null })
    .eq("id", id);
  if (error) return { ok: false, message: "No se pudo mover la pieza." };

  revalidatePath(PLANNER_PATH);
  return { ok: true };
}

/**
 * Elimina una pieza y sus archivos. Una publicada no se borra: es el registro
 * de la hipótesis con la que salió, y sin eso el ciclo del SOC no se puede
 * cerrar (mismo criterio que "nunca borrar resultados negativos", SOC §26).
 */
export async function deletePlannerItem(id: string): Promise<PlannerResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: current } = await supabase.from("brand_content_items").select("status, media").eq("id", id).maybeSingle();
  if (!current) return { ok: true };
  if (current.status === "PUBLICADO") {
    return { ok: false, message: "Una pieza publicada no se elimina: guarda la hipótesis con la que salió." };
  }

  const { error } = await supabase.from("brand_content_items").delete().eq("id", id);
  if (error) return { ok: false, message: "No se pudo eliminar la pieza." };

  const paths = parseItemMedia(current.media).map((file) => file.path);
  if (paths.length > 0) await supabase.storage.from(BRAND_MEDIA_BUCKET).remove(paths);

  revalidatePath(PLANNER_PATH);
  return { ok: true };
}

/**
 * Registra un archivo que el navegador ya subió al bucket. El navegador sube
 * directo a Storage (un video de cientos de MB no pasa por una Server Action),
 * así que acá se verifica todo lo que se pueda de nuevo: la ruta es del
 * usuario y de esta pieza, el objeto existe, y el tamaño y el tipo son los que
 * dice Storage, no los que dijo el cliente.
 */
export async function attachItemMedia(itemId: string, file: MediaFile): Promise<PlannerResult<{ media: MediaFile[] }>> {
  const user = await requireUser();
  const supabase = await createClient();

  const parsedFile = MediaFileSchema.safeParse(file);
  if (!parsedFile.success) return { ok: false, message: "El archivo no tiene el formato esperado." };

  const folder = `${user.id}/${itemId}`;
  const fileName = parsedFile.data.path.slice(folder.length + 1);
  if (!parsedFile.data.path.startsWith(`${folder}/`) || fileName.includes("/")) {
    return { ok: false, message: "La ruta del archivo no corresponde a esta pieza." };
  }

  const { data: item } = await supabase.from("brand_content_items").select("kind, status, media").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "La pieza no existe." };
  if (item.status === "PUBLICADO") return { ok: false, message: "La pieza ya está publicada." };

  const { data: listed } = await supabase.storage.from(BRAND_MEDIA_BUCKET).list(folder, { search: fileName, limit: 5 });
  const stored = listed?.find((entry) => entry.name === fileName);
  if (!stored) return { ok: false, message: "El archivo no llegó a subirse. Probá de nuevo." };

  const metadata = (stored.metadata ?? {}) as { size?: number; mimetype?: string };
  const verified: MediaFile = {
    ...parsedFile.data,
    size: typeof metadata.size === "number" ? metadata.size : parsedFile.data.size,
    mime: typeof metadata.mimetype === "string" ? metadata.mimetype : parsedFile.data.mime,
  };

  const current = parseItemMedia(item.media);
  const problem = validateFileForKind(item.kind, verified, current.length);
  if (problem) {
    await supabase.storage.from(BRAND_MEDIA_BUCKET).remove([verified.path]);
    return { ok: false, message: problem };
  }

  const media = [...current.filter((entry) => entry.path !== verified.path), verified];
  const { error } = await supabase
    .from("brand_content_items")
    .update({ media: media as unknown as Json })
    .eq("id", itemId);
  if (error) return { ok: false, message: "No se pudo guardar el archivo en la pieza." };

  revalidatePath(PLANNER_PATH);
  return { ok: true, media };
}

/** Saca un archivo de la pieza y lo borra del bucket. */
export async function removeItemMedia(itemId: string, path: string): Promise<PlannerResult<{ media: MediaFile[] }>> {
  await requireUser();
  const supabase = await createClient();

  const { data: item } = await supabase.from("brand_content_items").select("status, media").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "La pieza no existe." };
  if (item.status === "PUBLICADO") return { ok: false, message: "La pieza ya está publicada." };

  const media = parseItemMedia(item.media).filter((entry) => entry.path !== path);
  const { error } = await supabase
    .from("brand_content_items")
    .update({ media: media as unknown as Json })
    .eq("id", itemId);
  if (error) return { ok: false, message: "No se pudo sacar el archivo." };

  // Recién con la fila ya actualizada se borra el objeto; si el borrado falla queda un archivo huérfano
  // en el bucket, que es mejor que una pieza apuntando a un archivo que ya no existe.
  await supabase.storage.from(BRAND_MEDIA_BUCKET).remove([path]);

  revalidatePath(PLANNER_PATH);
  return { ok: true, media };
}

/**
 * "Ya la publiqué" (§3.13): marca una pieza como publicada apuntándola a un post
 * propio ya sincronizado, con la fecha REAL del post. Es el flujo de primera
 * clase cuando se publica a mano desde Instagram, y el que le da métricas a la
 * hipótesis de la pieza.
 *
 * Se revalida todo en el servidor (el selector del diálogo es una ayuda): que el
 * post exista y sea del usuario (RLS), que sea de la misma plataforma y de un
 * formato compatible, y que ninguna otra pieza lo tenga. Lo último lo garantiza
 * además el índice único sobre `post_id`.
 */
export async function markItemPublishedFromPost(itemId: string, postId: string): Promise<PlannerResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: item } = await supabase.from("brand_content_items").select("kind, status, platform").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "La pieza no existe." };
  if (item.status === "PUBLICADO") return { ok: false, message: "La pieza ya figura como publicada." };

  const kinds = postKindsFor(item.kind);
  if (!kinds) {
    return { ok: false, message: "Las historias no entran a la biblioteca de contenido: no hay un post al que vincularlas." };
  }

  const { data: post } = await supabase
    .from("brand_posts")
    .select("id, external_id, kind, published_at, brand_accounts!inner(platform)")
    .eq("id", postId)
    .maybeSingle();
  if (!post) return { ok: false, message: "Ese post no existe." };
  if (post.brand_accounts.platform !== item.platform) return { ok: false, message: "Ese post es de otra plataforma." };
  if (!kinds.includes(post.kind)) {
    return { ok: false, message: `Ese post es un ${KIND_LABEL[post.kind].toLowerCase()} y la pieza es un ${KIND_LABEL[item.kind].toLowerCase()}.` };
  }
  if (!post.published_at) return { ok: false, message: "Ese post no tiene fecha de publicación." };

  const { data: updated, error } = await supabase
    .from("brand_content_items")
    .update({
      status: "PUBLICADO",
      post_id: post.id,
      external_id: post.external_id,
      published_at: post.published_at,
      publish_started_at: null,
      publish_error: null,
    })
    .eq("id", itemId)
    .neq("status", "PUBLICADO")
    .is("post_id", null)
    .select("id");

  if (error?.code === "23505") return { ok: false, message: "Ese post ya está vinculado a otra pieza." };
  if (error) return { ok: false, message: "No se pudo marcar la pieza como publicada." };
  if (!updated || updated.length === 0) return { ok: false, message: "La pieza cambió mientras tanto. Recargá e intentá de nuevo." };

  revalidatePath(PLANNER_PATH);
  revalidatePath("/marca");
  return { ok: true };
}

/**
 * Deshace "Ya la publiqué" (§3.13). Un vínculo equivocado le pone a una hipótesis
 * las métricas de otra pieza, y eso es peor que no tener vínculo. La pieza vuelve
 * a LISTO, sin fecha de publicación ni post: desde ahí se puede volver a vincular
 * con el post correcto. Sirve también para un empalme automático que se equivocó.
 */
export async function unlinkPublishedItem(itemId: string): Promise<PlannerResult> {
  await requireUser();
  const supabase = await createClient();

  const { data: item } = await supabase.from("brand_content_items").select("status, post_id").eq("id", itemId).maybeSingle();
  if (!item) return { ok: false, message: "La pieza no existe." };
  if (item.status !== "PUBLICADO" || !item.post_id) return { ok: false, message: "La pieza no está vinculada a ningún post." };

  const { error } = await supabase
    .from("brand_content_items")
    .update({
      status: "LISTO",
      post_id: null,
      external_id: null,
      published_at: null,
      publish_started_at: null,
      publish_error: null,
    })
    .eq("id", itemId)
    .eq("status", "PUBLICADO");
  if (error) return { ok: false, message: "No se pudo desvincular la pieza." };

  revalidatePath(PLANNER_PATH);
  revalidatePath("/marca");
  return { ok: true };
}

export type PublishResult = PlannerResult<{ linked: boolean; message: string | null }>;

/**
 * "Publicar ahora" (§3.7). Publica en Instagram con un clic, sin
 * programación. Tres cosas que no se pueden hacer mal:
 *
 * 1. Se revalida todo en el servidor — lo que el navegador midió es una
 *    ayuda, no una garantía.
 * 2. Un candado (`publish_started_at`) contra el doble clic: publicar dos
 *    veces es publicar dos posts.
 * 3. Si no llega respuesta de Instagram en el último paso (corte, timeout), NO se
 *    sabe si salió. El candado no se libera y el mensaje manda a mirar Instagram
 *    antes de reintentar. Sólo un rechazo explícito libera el candado.
 */
export async function publishPlannerItem(id: string): Promise<PublishResult> {
  const user = await requireUser();
  if (!PUBLISH_FROM_APP_ENABLED) {
    return { ok: false, message: "Publicar desde la app está desactivado: publicá a mano en Instagram y registrala con “Ya la publiqué”." };
  }
  const supabase = await createClient();

  const { data: item } = await supabase.from("brand_content_items").select("*").eq("id", id).maybeSingle();
  if (!item) return { ok: false, message: "La pieza no existe." };
  if (item.status === "PUBLICADO") return { ok: false, message: "La pieza ya está publicada." };

  const provider = getBrandSource(item.platform);
  if (!provider || !provider.capabilities.publish.includes(item.kind)) {
    return { ok: false, message: "Este tipo de pieza no se publica desde la app." };
  }

  const media = parseItemMedia(item.media);
  const mediaProblem = validateMediaForPublish(item.kind, media);
  if (mediaProblem) return { ok: false, message: mediaProblem };

  const caption = item.kind === "HISTORIA" ? null : composeCaption(item.caption, item.hashtags);
  if (caption && caption.length > CAPTION_MAX_CHARS) {
    return { ok: false, message: `El caption con los hashtags suma ${caption.length} caracteres y el máximo es ${CAPTION_MAX_CHARS}.` };
  }

  // Las credenciales del usuario logueado: cada uno publica en SU cuenta.
  const connection = await provider.connect(supabase, user.id);
  if (!connection?.publish) {
    return { ok: false, message: `Conectá tu cuenta de ${provider.label} en Configuración para poder publicar.` };
  }

  // El candado: sólo lo toma quien encuentre la pieza sin publicar y sin otro intento reciente.
  const lockExpiry = new Date(Date.now() - PUBLISH_LOCK_MINUTES * 60_000).toISOString();
  const { data: locked } = await supabase
    .from("brand_content_items")
    .update({ publish_started_at: new Date().toISOString(), publish_error: null })
    .eq("id", id)
    .neq("status", "PUBLICADO")
    .or(`publish_started_at.is.null,publish_started_at.lt.${lockExpiry}`)
    .select("id");
  if (!locked || locked.length === 0) {
    return {
      ok: false,
      message: `Hay una publicación de esta pieza en curso o sin confirmar. Revisá Instagram: si ya salió, no la repitas; si no, esperá ${PUBLISH_LOCK_MINUTES} minutos y reintentá.`,
    };
  }

  const urls = media.map((file) => ({
    url: supabase.storage.from(BRAND_MEDIA_BUCKET).getPublicUrl(file.path).data.publicUrl,
    type: file.type,
  }));

  let externalId: string | null;
  let message: string | null;
  try {
    const result = await connection.publish({
      kind: item.kind,
      caption,
      media: urls,
    });
    externalId = result.externalId;
    message = result.message;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Error desconocido publicando.";
    const definitive = error instanceof MetaApiError && error.definitive;

    await supabase
      .from("brand_content_items")
      .update({ publish_error: detail, ...(definitive ? { publish_started_at: null } : {}) })
      .eq("id", id);
    revalidatePath(PLANNER_PATH);

    return {
      ok: false,
      message: definitive
        ? detail
        : `${detail} Revisá Instagram antes de reintentar: la pieza puede haberse publicado igual.`,
    };
  }

  const { error: saveError } = await supabase
    .from("brand_content_items")
    .update({
      status: "PUBLICADO",
      published_at: new Date().toISOString(),
      external_id: externalId,
      publish_started_at: null,
      publish_error: null,
    })
    .eq("id", id);

  revalidatePath(PLANNER_PATH);
  if (saveError) {
    return {
      ok: false,
      message: "La pieza se publicó en Instagram, pero no se pudo marcar como publicada acá. No la publiques de nuevo.",
    };
  }
  return { ok: true, linked: externalId !== null, message };
}
