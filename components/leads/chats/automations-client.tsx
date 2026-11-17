"use client";

import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Pause, Play, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { TagChip } from "@/components/leads/chats/tag-chip";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/feedback";
import { Section } from "@/components/ui/section";
import { Segmented, SegmentedButton } from "@/components/ui/tabs";
import {
  chooseAutomationModel,
  createContentAutomation,
  deleteContentAutomation,
  listRecentPostsForAssign,
  pauseContentAutomation,
  previewAutomationCopy,
  resumeContentAutomation,
  setModelConfirmMessage,
  type ContentAutomationView,
  type ModelCandidate,
  type PostCandidate,
  type TemplateView,
} from "@/lib/chats/automation-actions";
import type { AutomationStage } from "@/lib/chats/db";
import { describeTag, type TagView } from "@/lib/chats/tag-view";
import { cn } from "@/lib/utils";

const STAGE_LABEL: Record<AutomationStage, string> = { TOFU: "TOFU", MOFU: "MOFU" };
const STAGE_HINT: Record<AutomationStage, string> = {
  TOFU: "Contenido de alcance: la primera piza, pregunta si el recurso es para la persona o para su negocio.",
  MOFU: "Contenido para quien ya muestra interés: entrega el recurso y califica en una sola cadena de preguntas.",
};

function tagView(tag: string): TagView {
  return describeTag(tag, new Map());
}

/**
 * Las tres secciones de §1.26 sub-paso 4: elegir los moldes TOFU/MOFU,
 * asignar uno a una pieza nueva (clona el workflow y la automatización de
 * comentario en Zernio) y la lista de piezas ya automatizadas.
 */
export function AutomationsClient({
  ready,
  accountReady,
  candidates: initialCandidates,
  templates: initialTemplates,
  automations: initialAutomations,
}: {
  ready: boolean;
  accountReady: boolean;
  candidates: ModelCandidate[];
  templates: Partial<Record<AutomationStage, TemplateView>>;
  automations: ContentAutomationView[];
}) {
  const [tab, setTab] = useState<"modelos" | "asignar" | "piezas">(initialTemplates.TOFU && initialTemplates.MOFU ? "asignar" : "modelos");
  const [templates, setTemplates] = useState(initialTemplates);
  const [automations, setAutomations] = useState(initialAutomations);

  if (!accountReady) {
    return (
      <div className="px-6 py-8 lg:px-8">
        <EmptyState icon={<Sparkles className="size-5" strokeWidth={1.5} />} title="Conectá Instagram primero" description="Las automatizaciones se arman sobre la cuenta de Instagram conectada en Configuración." />
      </div>
    );
  }
  if (!ready) {
    return (
      <div className="px-6 py-8 lg:px-8">
        <EmptyState icon={<Sparkles className="size-5" strokeWidth={1.5} />} title="Falta aplicar una migración" description="Corré `npm run db:push` y `npm run db:types` (migraciones de §1.26 sub-paso 4) y recargá." />
      </div>
    );
  }

  const bothReady = Boolean(templates.TOFU && templates.MOFU);

  return (
    <div className="flex flex-col gap-6 px-6 py-6 lg:px-8">
      <Segmented>
        <SegmentedButton active={tab === "modelos"} onClick={() => setTab("modelos")}>
          Modelos {bothReady ? <CheckCircle2 className="ml-1 inline size-3 text-lm-success" /> : null}
        </SegmentedButton>
        <SegmentedButton active={tab === "asignar"} onClick={() => setTab("asignar")} disabled={!bothReady}>
          Asignar a una pieza
        </SegmentedButton>
        <SegmentedButton active={tab === "piezas"} onClick={() => setTab("piezas")}>
          Piezas {automations.length > 0 ? <span className="ml-1 font-mono text-[11px] text-lm-ink-3">{automations.length}</span> : null}
        </SegmentedButton>
      </Segmented>

      {tab === "modelos" ? <ModelsPanel candidates={initialCandidates} templates={templates} onChange={setTemplates} /> : null}
      {tab === "asignar" ? (
        bothReady ? (
          <AssignPanel templates={templates as Record<AutomationStage, TemplateView>} onCreated={(row) => setAutomations((items) => [row, ...items])} />
        ) : null
      ) : null}
      {tab === "piezas" ? <AutomationsList automations={automations} onChange={setAutomations} /> : null}
    </div>
  );
}

// ── Modelos ──────────────────────────────────────────────────────────────────

function ModelsPanel({
  candidates,
  templates,
  onChange,
}: {
  candidates: ModelCandidate[];
  templates: Partial<Record<AutomationStage, TemplateView>>;
  onChange: (templates: Partial<Record<AutomationStage, TemplateView>>) => void;
}) {
  return (
    <Section
      eyebrow="Modelos"
      title="Elegí cuál workflow es el molde TOFU y cuál el MOFU"
      description="Tienen que estar en borrador o pausados en Zernio (no activos): son moldes, no se usan directo. Cada pieza nueva clona el que elijas acá, con el recurso y la palabra clave reales."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {(["TOFU", "MOFU"] as const).map((stage) => (
          <ModelCard key={stage} stage={stage} candidates={candidates} template={templates[stage]} onSaved={(view) => onChange({ ...templates, [stage]: view })} />
        ))}
      </div>
    </Section>
  );
}

function ModelCard({
  stage,
  candidates,
  template,
  onSaved,
}: {
  stage: AutomationStage;
  candidates: ModelCandidate[];
  template: TemplateView | undefined;
  onSaved: (view: TemplateView) => void;
}) {
  const [selected, setSelected] = useState(template?.workflowId ?? "");
  const [confirmMessage, setConfirmMessage] = useState(template?.confirmMessage ?? "");
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function save() {
    if (!selected) return;
    setMessage(null);
    startTransition(async () => {
      const result = await chooseAutomationModel({ stage, workflowId: selected });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) onSaved({ stage, workflowId: selected, name: candidates.find((c) => c.id === selected)?.name ?? selected, tags: template?.tags ?? [], confirmMessage, ready: true });
    });
  }

  function saveConfirm() {
    startTransition(async () => {
      const result = await setModelConfirmMessage({ stage, message: confirmMessage });
      setMessage({ ok: result.ok, text: result.message });
    });
  }

  return (
    <div className="lm-glass-soft flex flex-col gap-3 rounded-lm-lg border border-lm-line-strong p-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-lm-sans text-[14px] font-semibold text-lm-ink">{STAGE_LABEL[stage]}</h4>
        {template ? (
          <span className="inline-flex items-center gap-1 text-xs text-lm-success">
            <CheckCircle2 className="size-3.5" strokeWidth={1.5} /> Elegido
          </span>
        ) : null}
      </div>
      <p className="text-[12.5px] text-lm-ink-2">{STAGE_HINT[stage]}</p>

      <Field label="Workflow molde" htmlFor={`model-${stage}`} hint={candidates.length === 0 ? "No hay workflows en borrador o pausados en la cuenta." : undefined}>
        <Select id={`model-${stage}`} value={selected} onChange={(event) => setSelected(event.target.value)} disabled={candidates.length === 0}>
          <option value="">Elegir…</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} ({candidate.status === "draft" ? "borrador" : "pausado"})
            </option>
          ))}
        </Select>
      </Field>

      {template && template.tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {template.tags.map((tag) => (
            <TagChip key={tag} view={tagView(tag)} />
          ))}
        </div>
      ) : null}

      <Field label="Mensaje de confirmación" htmlFor={`confirm-${stage}`} hint="Lo manda la automatización de comentario, antes de entregarle el turno al workflow. Admite el marcador [[TITULO]].">
        <Textarea id={`confirm-${stage}`} rows={2} maxLength={640} value={confirmMessage} onChange={(event) => setConfirmMessage(event.target.value)} placeholder="¡Genial que comentaste! Te paso [[TITULO]] por acá 👇" />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" disabled={pending || !selected} onClick={save}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar molde
        </Button>
        {template ? (
          <Button variant="secondary" size="sm" disabled={pending} onClick={saveConfirm}>
            Guardar mensaje
          </Button>
        ) : null}
      </div>
      {message ? <p className={cn("text-xs", message.ok ? "text-lm-success" : "text-lm-danger")}>{message.text}</p> : null}
    </div>
  );
}

// ── Asignar a una pieza ──────────────────────────────────────────────────────

function AssignPanel({ templates, onCreated }: { templates: Record<AutomationStage, TemplateView>; onCreated: (row: ContentAutomationView) => void }) {
  const [stage, setStage] = useState<AutomationStage>("TOFU");
  const [posts, setPosts] = useState<PostCandidate[] | null>(null);
  const [postsReady, setPostsReady] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [platformPostId, setPlatformPostId] = useState("");
  const [manualPost, setManualPost] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [resourceUrl, setResourceUrl] = useState("");
  const [resourceTitle, setResourceTitle] = useState("");
  const [manyChatOff, setManyChatOff] = useState(false);
  const [preview, setPreview] = useState<{ text: string; buttonTitle: string } | null>(null);
  const [previewPending, startPreview] = useTransition();
  const [pending, startCreate] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const selectedPost = posts?.find((post) => post.platformPostId === platformPostId) ?? null;

  function loadPosts() {
    setLoadingPosts(true);
    void listRecentPostsForAssign().then((result) => {
      setPosts(result.posts);
      setPostsReady(result.ready);
      setLoadingPosts(false);
    });
  }

  function runPreview() {
    if (!keyword.trim() || !resourceUrl.trim() || !resourceTitle.trim()) return;
    startPreview(async () => {
      const result = await previewAutomationCopy({ stage, keyword, resourceUrl, resourceTitle });
      setPreview(result.ok ? { text: result.text, buttonTitle: result.buttonTitle } : null);
    });
  }

  const canSubmit = Boolean(platformPostId.trim()) && keyword.trim().length >= 2 && /^https:\/\//.test(resourceUrl) && resourceTitle.trim() && manyChatOff;

  function submit() {
    setResult(null);
    startCreate(async () => {
      const outcome = await createContentAutomation({
        stage,
        platformPostId: platformPostId.trim(),
        postCaption: selectedPost?.caption ?? null,
        permalink: selectedPost?.permalink ?? null,
        keyword: keyword.trim(),
        resourceUrl: resourceUrl.trim(),
        resourceTitle: resourceTitle.trim(),
        manyChatOff,
      });
      setResult({ ok: outcome.ok, text: outcome.message });
      if (outcome.ok) {
        onCreated({
          id: crypto.randomUUID(),
          owner_id: "",
          channel_account_id: "",
          template_id: null,
          stage,
          platform_post_id: platformPostId.trim(),
          post_caption: selectedPost?.caption ?? null,
          permalink: selectedPost?.permalink ?? null,
          keywords: [keyword.trim()],
          resource_url: resourceUrl.trim(),
          resource_title: resourceTitle.trim(),
          zernio_comment_automation_id: null,
          zernio_workflow_id: null,
          status: "ACTIVA",
          error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          started: 0,
          completed: 0,
          failed: 0,
        });
        setKeyword("");
        setResourceUrl("");
        setResourceTitle("");
        setManyChatOff(false);
        setPlatformPostId("");
        setPreview(null);
      }
    });
  }

  return (
    <Section eyebrow="Asignar" title="Elegí la pieza, la palabra clave y el recurso" description="Se clona el molde elegido: un workflow nuevo con el recurso real y una automatización de comentario que lo dispara al comentar la palabra en ese post.">
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-col gap-4">
          <Field label="Tipo" htmlFor="assign-stage">
            <Select id="assign-stage" value={stage} onChange={(event) => setStage(event.target.value as AutomationStage)}>
              <option value="TOFU">TOFU — {templates.TOFU.name}</option>
              <option value="MOFU">MOFU — {templates.MOFU.name}</option>
            </Select>
          </Field>

          <Field label="Post o reel" htmlFor="assign-post" hint={manualPost ? "Pegá el id de la publicación en Instagram." : undefined}>
            {manualPost ? (
              <Input id="assign-post" value={platformPostId} onChange={(event) => setPlatformPostId(event.target.value)} placeholder="Id de la publicación" />
            ) : (
              <div className="flex flex-col gap-2">
                {posts === null ? (
                  <Button type="button" variant="secondary" size="sm" disabled={loadingPosts} onClick={loadPosts} className="self-start">
                    {loadingPosts ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Traer los posts recientes de Zernio
                  </Button>
                ) : posts.length === 0 ? (
                  <p className="text-[12.5px] text-lm-ink-3">{postsReady ? "No se encontraron publicaciones recientes con comentarios." : "No se pudo leer la cuenta."}</p>
                ) : (
                  <Select id="assign-post" value={platformPostId} onChange={(event) => setPlatformPostId(event.target.value)}>
                    <option value="">Elegir…</option>
                    {posts.map((post) => (
                      <option key={post.platformPostId} value={post.platformPostId}>
                        {(post.caption ?? "Sin texto").slice(0, 70)} · {post.commentCount} comentarios
                      </option>
                    ))}
                  </Select>
                )}
              </div>
            )}
            <button type="button" onClick={() => setManualPost((value) => !value)} className="mt-1 self-start text-xs text-lm-ink-3 hover:text-lm-ink">
              {manualPost ? "Elegir de la lista" : "Pegar el id a mano"}
            </button>
          </Field>

          <Field label="Palabra clave" htmlFor="assign-keyword" hint="La que va a comentar la gente. Se registran 3 variantes (tal cual, Capitalizada, MAYÚSCULA).">
            <Input id="assign-keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} onBlur={runPreview} placeholder="robots" maxLength={40} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Link del recurso" htmlFor="assign-url">
              <Input id="assign-url" value={resourceUrl} onChange={(event) => setResourceUrl(event.target.value)} onBlur={runPreview} placeholder="https://…" />
            </Field>
            <Field label="Nombre del recurso" htmlFor="assign-title" hint="Cómo se lo nombra en el DM.">
              <Input id="assign-title" value={resourceTitle} onChange={(event) => setResourceTitle(event.target.value)} onBlur={runPreview} placeholder="la guía de los 4 conectores" maxLength={80} />
            </Field>
          </div>

          <label className="flex items-start gap-2 text-[12.5px] text-lm-ink-2">
            <input type="checkbox" checked={manyChatOff} onChange={(event) => setManyChatOff(event.target.checked)} className="mt-0.5 size-3.5 accent-lm-signal" />
            Apagué la automatización de ManyChat de este reel (si tenía una), para que no respondan los dos.
          </label>

          <div className="flex items-center gap-3">
            <Button variant="primary" disabled={!canSubmit || pending} onClick={submit}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" strokeWidth={1.5} />}
              Crear y activar
            </Button>
            {result ? <p className={cn("text-[12.5px]", result.ok ? "text-lm-success" : "text-lm-danger")}>{result.text}</p> : null}
          </div>
        </div>

        <div className="lm-glass-soft flex flex-col gap-2 rounded-lm-lg border border-lm-line-strong p-3.5">
          <span className="font-lm-sans text-[11px] font-semibold tracking-[0.08em] text-lm-ink-3 uppercase">Vista previa del DM</span>
          {previewPending ? <Loader2 className="size-4 animate-spin text-lm-ink-3" /> : null}
          {preview ? (
            <div className="rounded-lm-md bg-lm-raised p-3 text-[13px] text-lm-ink">
              <p className="whitespace-pre-wrap">{preview.text}</p>
              <span className="mt-2 inline-block rounded-lm-sm border border-lm-line-strong px-2 py-1 text-[12px] text-lm-ink-2">{preview.buttonTitle}</span>
            </div>
          ) : (
            <p className="text-[12.5px] text-lm-ink-3">Completá la palabra, el link y el nombre del recurso para verla.</p>
          )}
        </div>
      </div>
    </Section>
  );
}

// ── Piezas ───────────────────────────────────────────────────────────────────

const STATUS_TONE: Record<string, string> = { ACTIVA: "text-lm-success", PAUSADA: "text-lm-ink-3", ERROR: "text-lm-danger" };

function AutomationsList({ automations, onChange }: { automations: ContentAutomationView[]; onChange: (update: (items: ContentAutomationView[]) => ContentAutomationView[]) => void }) {
  if (automations.length === 0) {
    return <EmptyState icon={<Sparkles className="size-5" strokeWidth={1.5} />} title="Todavía no automatizaste ninguna pieza" description="Elegí los moldes y asigná uno a un reel para empezar." />;
  }
  return (
    <Section eyebrow="Piezas" title="Automatizaciones activas por pieza">
      <ul className="flex flex-col divide-y divide-lm-line border-y border-lm-line">
        {automations.map((row) => (
          <AutomationRow key={row.id} row={row} onChange={onChange} />
        ))}
      </ul>
    </Section>
  );
}

function AutomationRow({ row, onChange }: { row: ContentAutomationView; onChange: (update: (items: ContentAutomationView[]) => ContentAutomationView[]) => void }) {
  const { confirm, confirmDialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function patch(status: ContentAutomationView["status"]) {
    onChange((items) => items.map((item) => (item.id === row.id ? { ...item, status } : item)));
  }

  function toggle() {
    const next = row.status === "ACTIVA" ? "PAUSADA" : "ACTIVA";
    patch(next);
    startTransition(async () => {
      const result = next === "PAUSADA" ? await pauseContentAutomation(row.id) : await resumeContentAutomation(row.id);
      if (!result.ok) {
        patch(row.status);
        setMessage(result.message);
      }
    });
  }

  async function remove() {
    const ok = await confirm({
      title: `¿Borrar la automatización de «${row.keywords[0]}»?`,
      description: "Se borra también en Zernio: la palabra deja de responder en ese reel.",
      confirmLabel: "Borrar",
      tone: "danger",
    });
    if (!ok) return;
    startTransition(async () => {
      const result = await deleteContentAutomation(row.id);
      if (result.ok) onChange((items) => items.filter((item) => item.id !== row.id));
      else setMessage(result.message);
    });
  }

  return (
    <>
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-lm-sans text-[13.5px] font-medium text-lm-ink">
            {STAGE_LABEL[row.stage]} · <span className="font-mono">{row.keywords[0]}</span>
            <span className={cn("text-xs font-medium", STATUS_TONE[row.status])}>{row.status === "ACTIVA" ? "Activa" : row.status === "PAUSADA" ? "Pausada" : "Error"}</span>
          </p>
          <p className="mt-0.5 truncate text-xs text-lm-ink-3">{row.resource_title}</p>
          {row.error ? (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-lm-danger">
              <AlertTriangle className="size-3" strokeWidth={1.5} /> {row.error}
            </p>
          ) : null}
          <p className="mt-0.5 font-mono text-[11px] text-lm-ink-3">
            {row.started} disparos · {row.completed} completados · {row.failed} fallidos
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {row.permalink ? (
            <a href={row.permalink} target="_blank" rel="noopener noreferrer" className="grid size-7 place-items-center rounded-lm-sm text-lm-ink-3 hover:bg-lm-raised hover:text-lm-ink" aria-label="Ver la pieza en Instagram">
              <ExternalLink className="size-3.5" strokeWidth={1.5} />
            </a>
          ) : null}
          <Button variant="secondary" size="sm" disabled={pending} onClick={toggle} aria-label={row.status === "ACTIVA" ? "Pausar" : "Reanudar"}>
            {row.status === "ACTIVA" ? <Pause className="size-3.5" strokeWidth={1.5} /> : <Play className="size-3.5" strokeWidth={1.5} />}
          </Button>
          <Button variant="danger" size="sm" disabled={pending} onClick={remove} aria-label="Borrar">
            <Trash2 className="size-3.5" strokeWidth={1.5} />
          </Button>
        </div>
        {message ? <p className="basis-full text-xs text-lm-danger">{message}</p> : null}
      </li>
      {confirmDialog}
    </>
  );
}
