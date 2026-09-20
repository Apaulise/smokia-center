"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Link2, Link2Off, Loader2, Send, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { MediaUploader } from "@/components/brand/planner/media-uploader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { LinkablePost } from "@/lib/brand/goals/queries";
import {
  createPlannerItem,
  deletePlannerItem,
  generateItemScript,
  markItemPublishedFromPost,
  publishPlannerItem,
  unlinkPublishedItem,
  updatePlannerItem,
} from "@/lib/brand/planner/actions";
import { postKindsFor } from "@/lib/brand/planner/link";
import type { PlannerItemChoice, PlannerNoteChoice } from "@/lib/brand/planner/queries";
import { validateMediaForPublish, type MediaFile } from "@/lib/brand/planner/rules";
import {
  CAPTION_MAX_CHARS,
  composeCaption,
  CONTENT_OBJECTIVES,
  DEFAULT_SCHEDULE_TIME,
  EDITABLE_STATUSES,
  KIND_LABEL,
  normalizeHashtags,
  OBJECTIVE_LABEL,
  PUBLISH_FROM_APP_ENABLED,
  STATUS_LABEL,
  type ContentKind,
  type ContentObjective,
  type ContentStatus,
  type PlannerItem,
} from "@/lib/brand/planner/schema";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { isoDateOf, timeOfDay } from "@/lib/leads/calendar";

/** Los tipos que se eligen al planificar. VIDEO y SHORT sólo aparecen si la pieza ya viene con uno. */
const BASE_KINDS: ContentKind[] = ["REEL", "POST", "CARRUSEL", "HISTORIA"];

const HYPOTHESIS_PLACEHOLDER =
  "Probamos si [formato] aplicado a [tema] mediante [ángulo] rinde mejor porque […]";

const DATE_INPUT =
  "h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink disabled:opacity-40";

function Field({ label, hint, action, children }: { label: string; hint?: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <div>
      {action ? (
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <label className="text-xs text-muted">{label}</label>
          {action}
        </div>
      ) : (
        <label className="mb-1.5 block text-xs text-muted">{label}</label>
      )}
      {children}
      {hint ? <p className="mt-1 text-xs text-muted/80">{hint}</p> : null}
    </div>
  );
}

/**
 * Crear o editar una pieza del pipeline (Plans/03 §3.7). Desde acá se sube el
 * archivo y se publica. Publicar guarda primero lo que esté en pantalla: la
 * acción del servidor lee la base, no el formulario.
 */
export function PlannerItemDialog({
  mode,
  item,
  defaultDate,
  platform,
  ownerId,
  accountUsername,
  choices,
  linkablePosts,
  onClose,
  onDone,
}: {
  mode: "create" | "edit";
  item?: PlannerItem;
  /** "YYYY-MM-DD" del día en que se hizo clic, al crear desde la grilla. */
  defaultDate?: string;
  platform: BrandPlatform;
  ownerId: string;
  accountUsername: string | null;
  choices: { items: PlannerItemChoice[]; notes: PlannerNoteChoice[] };
  /** Posts propios recientes sin pieza enlazada: lo que ofrece "Ya la publiqué". */
  linkablePosts: LinkablePost[];
  onClose: () => void;
  /** Algo cambió en la base: el padre refresca y cierra. */
  onDone: () => void;
}) {
  const published = item?.status === "PUBLICADO";

  const [title, setTitle] = useState(item?.title ?? "");
  const [kind, setKind] = useState<ContentKind>(item?.kind ?? "REEL");
  const [status, setStatus] = useState<ContentStatus>(item?.status ?? "IDEA");
  const [objective, setObjective] = useState<ContentObjective | "">(item?.objective ?? "");
  const [hypothesis, setHypothesis] = useState(item?.hypothesis ?? "");
  const [hook, setHook] = useState(item?.hook ?? "");
  const [angle, setAngle] = useState(item?.angle ?? "");
  const [idea, setIdea] = useState(item?.idea ?? "");
  const [script, setScript] = useState(item?.script ?? "");
  const [caption, setCaption] = useState(item?.caption ?? "");
  const [hashtags, setHashtags] = useState((item?.hashtags ?? []).join(" "));
  const [date, setDate] = useState(item?.scheduled_for ? isoDateOf(item.scheduled_for) : (defaultDate ?? ""));
  const [time, setTime] = useState(item?.scheduled_for ? timeOfDay(item.scheduled_for) : DEFAULT_SCHEDULE_TIME);
  const [parentId, setParentId] = useState(item?.parent_item_id ?? "");
  const [knowledgeId, setKnowledgeId] = useState(item?.knowledge_id ?? "");
  const [media, setMedia] = useState<MediaFile[]>(item?.media ?? []);

  const [busy, setBusy] = useState<"save" | "delete" | "publish" | "link" | "unlink" | "script" | null>(null);
  const [scriptCaveat, setScriptCaveat] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [linking, setLinking] = useState(false);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const kindOptions = BASE_KINDS.includes(kind) ? BASE_KINDS : [...BASE_KINDS, kind];
  const tags = normalizeHashtags(hashtags.split(/\s+/));
  const composedLength = composeCaption(caption, tags)?.length ?? 0;
  const publishProblem = validateMediaForPublish(kind, media);
  const isStory = kind === "HISTORIA";
  // Las historias no entran a la biblioteca de contenido: no hay un post al que vincularlas.
  const compatibleKinds = postKindsFor(kind);
  const candidates = compatibleKinds ? linkablePosts.filter((post) => compatibleKinds.includes(post.kind)) : [];

  function buildInput() {
    return {
      title,
      kind,
      // PUBLICADO no se elige a mano: en una pieza publicada el servidor ignora estado, tipo y fecha.
      status: published ? ("LISTO" as const) : (status as Exclude<ContentStatus, "PUBLICADO">),
      objective: objective || null,
      hypothesis,
      hook,
      angle,
      idea,
      script,
      caption: isStory ? "" : caption,
      hashtags: isStory ? [] : tags,
      scheduledDate: date || null,
      scheduledTime: date ? time || null : null,
      parentItemId: parentId || null,
      knowledgeId: knowledgeId || null,
    };
  }

  async function save(): Promise<boolean> {
    const result = item ? await updatePlannerItem(item.id, buildInput()) : await createPlannerItem(platform, buildInput());
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    return true;
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    const ok = await save();
    setBusy(null);
    if (ok) onDone();
  }

  /** Escribe el guion en el campo, sin guardar: se lee, se corrige y se guarda con el resto de la pieza. */
  async function handleGenerateScript() {
    if (script.trim() && !window.confirm("Ya hay un guion escrito. ¿Reemplazarlo por uno nuevo?")) return;
    setBusy("script");
    setError(null);
    setScriptCaveat(null);
    const result = await generateItemScript({ title, kind, objective: objective || null, hypothesis, hook, angle, idea });
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setScript(result.script);
    setScriptCaveat(result.caveat);
  }

  async function handleDelete() {
    if (!item) return;
    if (!window.confirm("¿Eliminar esta pieza y sus archivos? No se puede deshacer.")) return;
    setBusy("delete");
    setError(null);
    const result = await deletePlannerItem(item.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone();
  }

  async function handlePublish() {
    if (!item) return;
    setBusy("publish");
    setError(null);
    if (!(await save())) {
      setBusy(null);
      setConfirming(false);
      return;
    }
    const result = await publishPlannerItem(item.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      setConfirming(false);
      return;
    }
    onDone();
  }

  async function handleLink() {
    if (!item || !selectedPostId) return;
    setBusy("link");
    setError(null);
    // Igual que al publicar: la acción del servidor lee la base, así que primero se guarda lo que hay en pantalla.
    if (!(await save())) {
      setBusy(null);
      return;
    }
    const result = await markItemPublishedFromPost(item.id, selectedPostId);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone();
  }

  async function handleUnlink() {
    if (!item) return;
    if (!window.confirm("¿Desvincular esta pieza de su post? Vuelve a “Listo”, sin fecha de publicación ni métricas, y se puede vincular de nuevo.")) return;
    setBusy("unlink");
    setError(null);
    const result = await unlinkPublishedItem(item.id);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onDone();
  }

  const lineage = choices.items.filter((choice) => choice.id !== item?.id);
  const missingForEvaluation = [!objective ? "objetivo" : null, !hypothesis.trim() ? "hipótesis" : null].filter(Boolean);

  return (
    <Dialog
      open
      onClose={busy ? () => undefined : onClose}
      title={mode === "edit" ? "Editar pieza" : "Nueva pieza"}
      description={item ? `${KIND_LABEL[item.kind]} · ${STATUS_LABEL[item.status]}` : undefined}
      className="max-w-2xl"
    >
      <div className="max-h-[calc(100vh-14rem)] space-y-5 overflow-y-auto pr-1">
        {published ? (
          <div className="space-y-2 rounded-[12px] border border-positive/30 bg-positive/5 p-3 text-sm">
            <p className="flex items-center gap-1.5 text-positive">
              <CheckCircle2 className="size-4" />
              Publicada{item?.published_at ? ` el ${new Date(item.published_at).toLocaleString("es-AR")}` : ""}.
            </p>
            {item?.post_id ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link href={`/marca/contenido/${item.post_id}`} className="inline-flex items-center gap-1.5 text-cyan hover:underline">
                  Ver sus métricas
                  <ExternalLink className="size-3.5" />
                </Link>
                <button
                  type="button"
                  onClick={handleUnlink}
                  disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink disabled:opacity-40"
                >
                  {busy === "unlink" ? <Loader2 className="size-3.5 animate-spin" /> : <Link2Off className="size-3.5" />}
                  Desvincular
                </button>
              </div>
            ) : (
              <p className="text-xs text-muted">
                {item?.kind === "HISTORIA"
                  ? "Las historias no entran a la biblioteca de contenido, así que no tienen métricas para empalmar."
                  : "Todavía no está empalmada con sus métricas: aparece después de la próxima sincronización."}
              </p>
            )}
            <p className="text-xs text-muted">Una pieza publicada conserva su tipo, estado y fecha; se puede seguir editando la hipótesis y las notas.</p>
          </div>
        ) : null}

        {item?.publish_error && !published ? (
          <p className="flex items-start gap-1.5 rounded-[12px] border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            El último intento de publicar falló: {item.publish_error}
          </p>
        ) : null}

        <Field label="Título">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Un nombre corto para encontrarla" autoFocus={mode === "create"} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo">
            <Select value={kind} onChange={(e) => setKind(e.target.value as ContentKind)} disabled={published}>
              {kindOptions.map((value) => (
                <option key={value} value={value}>
                  {KIND_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Estado">
            {published ? (
              <div className="flex h-10 items-center">
                <Badge tone="positive">Publicado</Badge>
              </div>
            ) : (
              <Select value={status} onChange={(e) => setStatus(e.target.value as ContentStatus)}>
                {EDITABLE_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Objetivo" hint="Contra qué se va a medir (SOC §16).">
            <Select value={objective} onChange={(e) => setObjective(e.target.value as ContentObjective | "")}>
              <option value="">Sin definir</option>
              {CONTENT_OBJECTIVES.map((value) => (
                <option key={value} value={value}>
                  {OBJECTIVE_LABEL[value]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Fecha planificada">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={published} className={DATE_INPUT} />
          </Field>
          <Field label="Hora">
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={published || !date} className={DATE_INPUT} />
          </Field>
        </div>

        <Field label="Hipótesis" hint="Escribila antes de grabar: es lo que después se compara contra el resultado (SOC §12).">
          <Textarea value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} placeholder={HYPOTHESIS_PLACEHOLDER} className="min-h-20" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hook">
            <Input value={hook} onChange={(e) => setHook(e.target.value)} placeholder="La primera frase, o el primer plano" />
          </Field>
          <Field label="Ángulo">
            <Input value={angle} onChange={(e) => setAngle(e.target.value)} placeholder="Desde dónde se cuenta" />
          </Field>
        </div>

        {item?.source_url ? (
          <p className="rounded-[12px] border border-line/60 bg-surface/40 px-3 py-2 text-xs text-muted">
            Salió de un outlier de la competencia.{" "}
            <a href={item.source_url} target="_blank" rel="noreferrer noopener" className="text-cyan hover:underline">
              Ver la publicación original
            </a>
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Desciende de" hint="Si es una variante de un ganador, cuál: forma el cluster (SOC §13).">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)}>
              <option value="">Ninguna — es un experimento nuevo</option>
              {lineage.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.title} ({KIND_LABEL[choice.kind]})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Salió de" hint="La nota de RADAR o de WINNERS que dio la idea.">
            <Select value={knowledgeId} onChange={(e) => setKnowledgeId(e.target.value)}>
              <option value="">Ninguna</option>
              {choices.notes.map((note) => (
                <option key={note.id} value={note.id}>
                  {note.collection} · {note.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Idea">
          <Textarea value={idea} onChange={(e) => setIdea(e.target.value)} className="min-h-24" />
        </Field>
        <Field
          label="Guion"
          hint={busy === "script" ? "Escribiendo el guion a partir de la idea: puede tardar un minuto." : undefined}
          action={
            published ? null : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={busy !== null || !idea.trim()}
                title={idea.trim() ? undefined : "Escribí la idea primero: el guion se arma a partir de ella."}
                onClick={handleGenerateScript}
              >
                {busy === "script" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {busy === "script" ? "Generando…" : "Generar guion"}
              </Button>
            )
          }
        >
          <Textarea value={script} onChange={(e) => setScript(e.target.value)} className="min-h-32" />
        </Field>
        {scriptCaveat ? (
          <p className="-mt-3 flex items-start gap-1.5 rounded-[12px] border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
            {scriptCaveat}
          </p>
        ) : null}

        {isStory ? (
          <p className="text-xs text-muted">Las historias no llevan caption ni hashtags: Instagram no los admite.</p>
        ) : (
          <>
            <Field label="Caption">
              <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} className="min-h-24" />
            </Field>
            <Field
              label="Hashtags"
              hint={
                <span className={composedLength > CAPTION_MAX_CHARS ? "text-danger" : undefined}>
                  Caption con hashtags: {composedLength} de {CAPTION_MAX_CHARS} caracteres.
                </span>
              }
            >
              <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#ia #automatizacion" />
            </Field>
          </>
        )}

        {PUBLISH_FROM_APP_ENABLED ? (
        <div className="space-y-2 border-t border-line/60 pt-5">
          <h4 className="text-xs font-medium tracking-wide text-muted uppercase">Archivo</h4>
          {item ? (
            <MediaUploader
              ownerId={ownerId}
              itemId={item.id}
              kind={kind}
              media={media}
              onChange={setMedia}
              disabled={published || busy !== null}
            />
          ) : (
            <p className="text-xs text-muted">Guardá la pieza y abrila de nuevo para subir el archivo: la ruta en el bucket lleva su id.</p>
          )}
        </div>
        ) : null}
      </div>

      {error ? <p className="mt-4 text-sm text-danger">{error}</p> : null}

      {linking && item ? (
        <div className="mt-4 space-y-3 rounded-[12px] border border-cyan/30 bg-cyan/5 p-4">
          <p className="text-sm text-ink">
            ¿Cuál de tus publicaciones es <strong>“{title}”</strong>?
          </p>
          {candidates.length === 0 ? (
            <p className="text-xs text-muted">
              No hay posts propios sin vincular de un formato compatible. Si la publicaste hace poco, sincronizá desde el dashboard de Marca y volvé a probar.
            </p>
          ) : (
            <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-1">
              {candidates.map((post) => (
                <li key={post.postId}>
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-[12px] border p-2.5 text-sm ${
                      selectedPostId === post.postId ? "border-cyan/60 bg-cyan/10" : "border-line/60 hover:bg-surface/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="linkable-post"
                      className="mt-1 accent-cyan"
                      checked={selectedPostId === post.postId}
                      onChange={() => setSelectedPostId(post.postId)}
                    />
                    <span className="min-w-0">
                      <span className="tabular block text-xs text-muted">
                        {post.publishedAt ? new Date(post.publishedAt).toLocaleString("es-AR") : "sin fecha"} ·{" "}
                        {KIND_LABEL[post.kind as ContentKind] ?? post.kind}
                        {post.views !== null ? ` · ${post.views.toLocaleString("es-AR")} views` : ""}
                      </span>
                      <span className="block truncate text-ink">{post.caption?.replace(/\s+/g, " ").trim() || "Sin caption"}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted">Queda publicada con la fecha real del post y toma sus métricas. Se puede deshacer con “Desvincular”.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setLinking(false)} disabled={busy === "link"}>
              Volver
            </Button>
            <Button type="button" variant="primary" onClick={handleLink} disabled={busy === "link" || !selectedPostId}>
              {busy === "link" ? <Loader2 className="size-3.5 animate-spin" /> : <Link2 className="size-3.5" />}
              {busy === "link" ? "Vinculando…" : "Marcar como publicada"}
            </Button>
          </div>
        </div>
      ) : confirming && item ? (
        <div className="mt-4 space-y-3 rounded-[12px] border border-cyan/30 bg-cyan/5 p-4">
          <p className="text-sm text-ink">
            Vas a publicar <strong>“{title}”</strong> en {accountUsername ? `@${accountUsername}` : "Instagram"} ahora mismo. Desde la app no se puede deshacer.
          </p>
          {missingForEvaluation.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              Sale sin {missingForEvaluation.join(" ni ")}: después no vas a poder saber si el experimento funcionó ni contra qué.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)} disabled={busy === "publish"}>
              Volver
            </Button>
            <Button type="button" variant="primary" onClick={handlePublish} disabled={busy === "publish"}>
              {busy === "publish" ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              {busy === "publish" ? "Publicando…" : "Sí, publicar ahora"}
            </Button>
          </div>
          {busy === "publish" ? <p className="text-xs text-muted">Instagram procesa el archivo antes de publicarlo: un video puede tardar hasta un minuto. No cierres esta ventana.</p> : null}
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line/60 pt-4">
          {item && !published ? (
            <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={handleDelete}>
              {busy === "delete" ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Eliminar
            </Button>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {PUBLISH_FROM_APP_ENABLED && item && !published ? (
              <span className="text-xs text-muted" title={publishProblem ?? undefined}>
                {publishProblem ? publishProblem : null}
              </span>
            ) : null}
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy !== null}>
              Cancelar
            </Button>
            {item && !published && compatibleKinds ? (
              <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => setLinking(true)}>
                <Link2 className="size-3.5" />
                Ya la publiqué
              </Button>
            ) : null}
            {PUBLISH_FROM_APP_ENABLED && item && !published ? (
              <Button type="button" variant="secondary" disabled={busy !== null || publishProblem !== null} onClick={() => setConfirming(true)}>
                <Send className="size-3.5" />
                Publicar ahora
              </Button>
            ) : null}
            <Button type="button" variant="primary" disabled={busy !== null || !title.trim()} onClick={handleSave}>
              {busy === "save" ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
              {mode === "edit" ? "Guardar" : "Crear"}
            </Button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
