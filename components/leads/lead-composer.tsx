"use client";

import { Check, Copy, Loader2, MessageSquareText, RefreshCw, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { RewriteButtons } from "@/components/leads/rewrite-buttons";
import { SuggestedReplyConfirm } from "@/components/leads/suggested-reply-confirm";
import { Button, Kbd } from "@/components/leads/ui/button";
import { Composer, ComposerBody, ComposerFoot, ComposerHead } from "@/components/leads/ui/composer";
import { Textarea } from "@/components/leads/ui/field";
import { SegmentedButton } from "@/components/leads/ui/tabs";
import { ANGLE_LABEL, type SalesAngle } from "@/lib/leads/ai/angles";
import {
  analyzeLeadResponseAction,
  confirmLeadOpening,
  generateLeadFollowup,
  generateLeadOpening,
  type AnalyzeActionState,
  type OpeningActionState,
} from "@/lib/leads/ai/actions";
import type { LeadStatus } from "@/lib/leads/status";

type Channel = "WHATSAPP" | "EMAIL" | "INSTAGRAM";
type Draft = Extract<OpeningActionState, { ok: true }>["opening"];
type Analysis = Extract<AnalyzeActionState, { ok: true }>;

const CHANNEL_LABEL: Record<Channel, string> = { WHATSAPP: "WhatsApp", EMAIL: "Email", INSTAGRAM: "Instagram" };

function composerModeFor(status: LeadStatus, nextActionAt: string | null): "apertura" | "analizar" | "seguimiento" {
  if (status === "NUEVO" || status === "LISTO") return "apertura";
  if (status === "AHORA_NO" && nextActionAt && new Date(nextActionAt) <= new Date()) return "seguimiento";
  return "analizar";
}

function ChannelSegmented({ channel, onChange }: { channel: Channel; onChange: (c: Channel) => void }) {
  return (
    <div className="inline-flex gap-0.5 rounded-lm-sm border border-lm-line bg-lm-surface p-0.5">
      {(["WHATSAPP", "INSTAGRAM", "EMAIL"] as const).map((c) => (
        <SegmentedButton key={c} active={channel === c} onClick={() => onChange(c)} className="h-6 px-2 text-xs">
          {CHANNEL_LABEL[c]}
        </SegmentedButton>
      ))}
    </div>
  );
}

/**
 * Composer contextual del detalle de lead (Design System Conversation): un
 * solo bloque que cambia según la etapa — consolida lo que antes eran tres
 * paneles separados (OpeningPanel/AnalyzePanel/FollowUpPanel, Plan
 * §1.11/§1.12/§1.16). La lógica de cada uno no cambió, sólo dónde vive.
 */
export function LeadComposer({
  leadId,
  status,
  nextActionAt,
  hasPhone,
  hasInstagram,
}: {
  leadId: string;
  status: LeadStatus;
  nextActionAt: string | null;
  hasPhone: boolean;
  hasInstagram: boolean;
}) {
  const mode = composerModeFor(status, nextActionAt);

  if (mode === "apertura") {
    return <AperturaComposer leadId={leadId} hasPhone={hasPhone} hasInstagram={hasInstagram} />;
  }
  if (mode === "seguimiento") {
    return <SeguimientoComposer leadId={leadId} />;
  }
  return <AnalizarComposer leadId={leadId} />;
}

function AperturaComposer({ leadId, hasPhone, hasInstagram }: { leadId: string; hasPhone: boolean; hasInstagram: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState<Channel>(hasPhone ? "WHATSAPP" : hasInstagram ? "INSTAGRAM" : "EMAIL");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    setCopied(false);
    startTransition(async () => {
      const result = await generateLeadOpening(leadId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDraft(result.opening);
      setMessage(result.opening.message);
    });
  }

  function handleCopy() {
    void navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleConfirm() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await confirmLeadOpening({ leadId, message, angle: draft.angle as SalesAngle, variant: draft.variant, channel });
      if (!result?.ok) {
        setError(result?.message ?? "No se pudo confirmar el envío.");
        return;
      }
      setDraft(null);
      setConfirming(false);
      router.refresh();
    });
  }

  if (!draft) {
    return (
      <Composer>
        <ComposerHead>
          <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Apertura sugerida</span>
        </ComposerHead>
        <ComposerBody>
          <p className="text-lm-ink-2">Generá el primer mensaje para este negocio: contexto verificable + una pregunta.</p>
          {error ? <p className="mt-2 text-lm-danger">{error}</p> : null}
        </ComposerBody>
        <ComposerFoot>
          <Button type="button" variant="primary" disabled={pending} onClick={handleGenerate}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" strokeWidth={1.5} />}
            {pending ? "Generando…" : "Generar apertura"}
          </Button>
        </ComposerFoot>
      </Composer>
    );
  }

  return (
    <Composer>
      <ComposerHead>
        <div className="flex items-center gap-2">
          <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Apertura sugerida</span>
          <span className="text-xs text-lm-ink-3">{ANGLE_LABEL[draft.angle as SalesAngle]} · variante {draft.variant}</span>
        </div>
        <ChannelSegmented channel={channel} onChange={setChannel} />
      </ComposerHead>
      <ComposerBody className="flex flex-col gap-3">
        <p className="text-xs text-lm-ink-3">{draft.angleReason}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-xs text-lm-ink-3">Objetivo de este mensaje</p>
            <p className="text-lm-ink">{draft.objective}</p>
          </div>
          <div>
            <p className="mb-1 text-xs text-lm-ink-3">La pregunta</p>
            <p className="text-lm-ink">{draft.question}</p>
          </div>
        </div>
        <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-24" />
        <RewriteButtons message={message} onRewrite={setMessage} disabled={pending} />
        {error ? <p className="text-lm-danger">{error}</p> : null}

        {confirming ? (
          <div className="flex flex-col gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised p-3">
            <p className="text-lm-ink">¿Ya mandaste este mensaje? Se guarda en la conversación y avanza el pipeline si seguía sin contactar.</p>
            <ChannelSegmented channel={channel} onChange={setChannel} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
                Volver
              </Button>
              <Button type="button" variant="primary" size="sm" onClick={handleConfirm} disabled={pending || !message.trim()}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" strokeWidth={1.5} />}
                {pending ? "Guardando…" : "Sí, ya lo mandé"}
              </Button>
            </div>
          </div>
        ) : null}
      </ComposerBody>
      {!confirming ? (
        <ComposerFoot>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleCopy}>
            <Copy className="size-3.5" strokeWidth={1.5} />
            {copied ? "Copiado" : "Copiar"}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleGenerate}>
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
            Regenerar
          </Button>
          <Button type="button" variant="primary" size="sm" disabled={pending || !message.trim()} onClick={() => setConfirming(true)}>
            <Send className="size-3.5" strokeWidth={1.5} />
            Confirmar y marcar como enviado
            <Kbd className="ml-1">⌘↵</Kbd>
          </Button>
        </ComposerFoot>
      ) : null}
    </Composer>
  );
}

const RESPONSE_TYPE_LABEL: Record<"AUTORESPUESTA" | "HUMANA", string> = {
  AUTORESPUESTA: "Autorespuesta — no cuenta como interés",
  HUMANA: "Respondió una persona",
};

function AnalizarComposer({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [text, setText] = useState("");
  const [channel, setChannel] = useState<Channel>("WHATSAPP");
  const [result, setResult] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleAnalyze() {
    setError(null);
    startTransition(async () => {
      const response = await analyzeLeadResponseAction({ leadId, responseText: text, channel });
      if (!response.ok) {
        setError(response.message);
        return;
      }
      setResult(response);
      setText("");
      router.refresh();
    });
  }

  return (
    <Composer>
      <ComposerHead>
        <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Analizar respuesta</span>
        <ChannelSegmented channel={channel} onChange={setChannel} />
      </ComposerHead>
      <ComposerBody className="flex flex-col gap-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-24"
          placeholder="Pegá acá el mensaje tal como lo escribió el prospecto…"
        />
        {error ? <p className="text-lm-danger">{error}</p> : null}

        {result ? (
          <div className="flex flex-col gap-3 rounded-lm-sm border border-lm-line bg-lm-raised p-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-lm-ink-2">{RESPONSE_TYPE_LABEL[result.analysis.analysis.response_type]}</span>
              <span className="text-lm-signal-text">Interés {result.analysis.analysis.interest_level}/10</span>
              {result.analysis.analysis.not_now ? <span className="text-lm-ink-3">Ahora no</span> : null}
              {result.analysis.analysis.disqualify ? <span className="text-lm-danger">Descartar</span> : null}
            </div>

            {result.analysis.analysis.learned ? (
              <div>
                <p className="mb-1 text-xs text-lm-ink-3">Qué se aprendió</p>
                <p className="text-lm-ink">{result.analysis.analysis.learned}</p>
              </div>
            ) : null}

            <div>
              <p className="mb-1 text-xs text-lm-ink-3">Próxima acción recomendada</p>
              <p className="text-lm-ink">{result.nextActionReason}</p>
            </div>

            {result.analysis.crm_update.signals.length > 0 ? (
              <div>
                <p className="mb-1 text-xs text-lm-ink-3">Señales detectadas</p>
                <ul className="flex flex-col gap-1">
                  {result.analysis.crm_update.signals.map((signal, index) => (
                    <li key={index} className="text-lm-ink">
                      <span className="text-xs text-lm-ink-3">
                        [{signal.kind} · {signal.status}]
                      </span>{" "}
                      {signal.title}
                      {signal.evidence ? <span className="text-lm-ink-3"> — “{signal.evidence}”</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {result.analysis.suggested_reply.has_reply && result.analysis.suggested_reply.message ? (
              <SuggestedReplyBox
                leadId={leadId}
                initialMessage={result.analysis.suggested_reply.message}
                onConfirmed={() => setResult(null)}
              />
            ) : (
              <p className="text-xs text-lm-ink-3">Todavía no corresponde responder — esperá o revisá la próxima acción de arriba.</p>
            )}
          </div>
        ) : null}
      </ComposerBody>
      <ComposerFoot>
        {result ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setResult(null)}>
            <RefreshCw className="size-3.5" strokeWidth={1.5} />
            Analizar otra respuesta
          </Button>
        ) : (
          <Button type="button" variant="primary" disabled={pending || !text.trim()} onClick={handleAnalyze}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquareText className="size-3.5" strokeWidth={1.5} />}
            {pending ? "Analizando…" : "Analizar"}
            <Kbd className="ml-1">⌘↵</Kbd>
          </Button>
        )}
      </ComposerFoot>
    </Composer>
  );
}

function SuggestedReplyBox({
  leadId,
  initialMessage,
  onConfirmed,
}: {
  leadId: string;
  initialMessage: string;
  onConfirmed?: () => void;
}) {
  const [message, setMessage] = useState(initialMessage);

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-lm-ink-3">Mensaje sugerido — editable</p>
      <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-20" />
      <RewriteButtons message={message} onRewrite={setMessage} />
      <SuggestedReplyConfirm leadId={leadId} message={message} onConfirmed={onConfirmed} />
    </div>
  );
}

function SeguimientoComposer({ leadId }: { leadId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [cannotReason, setCannotReason] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleGenerate() {
    setError(null);
    setCannotReason(null);
    startTransition(async () => {
      const result = await generateLeadFollowup(leadId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(result.message);
      setCannotReason(result.cannotGenerateReason);
    });
  }

  return (
    <Composer>
      <ComposerHead>
        <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Seguimiento</span>
      </ComposerHead>
      <ComposerBody className="flex flex-col gap-3">
        <p className="text-lm-ink-2">Le llegó la fecha de retomar a un &quot;ahora no&quot; — el mensaje va a citar la conversación anterior.</p>
        {error ? <p className="text-lm-danger">{error}</p> : null}

        {message ? (
          <div className="flex flex-col gap-2">
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} className="min-h-20" />
            <RewriteButtons message={message} onRewrite={setMessage} disabled={pending} />
          </div>
        ) : cannotReason ? (
          <p className="rounded-lm-sm border border-lm-line-strong bg-lm-raised p-3 text-xs text-lm-ink-2">{cannotReason}</p>
        ) : null}
      </ComposerBody>
      <ComposerFoot>
        {message ? (
          <>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleGenerate}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" strokeWidth={1.5} />}
              Regenerar
            </Button>
            <SuggestedReplyConfirm leadId={leadId} message={message} onConfirmed={() => setMessage(null)} />
          </>
        ) : (
          <Button type="button" variant="primary" disabled={pending} onClick={handleGenerate}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" strokeWidth={1.5} />}
            {pending ? "Generando…" : "Generar seguimiento"}
          </Button>
        )}
      </ComposerFoot>
    </Composer>
  );
}
