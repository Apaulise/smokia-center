"use client";

import { Check, Copy, Loader2, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { confirmMessageSent } from "@/lib/leads/ai/actions";
import { buildWhatsappLink } from "@/lib/leads/templates";
import { Button } from "@/components/leads/ui/button";

/**
 * Copiar / "Ya lo mandé" para cualquier mensaje del vendedor que no sea la
 * apertura (Plan §1.15/§1.16): la respuesta sugerida al analizar, o un
 * seguimiento generado. El envío en sí sigue siendo manual — esto sólo
 * registra que ya se mandó (SPA §24).
 */
export function SuggestedReplyConfirm({
  leadId,
  message,
  kind,
  generatedContent,
  phone,
  onConfirmed,
}: {
  leadId: string;
  message: string;
  kind?: "RESPUESTA" | "SEGUIMIENTO";
  /** El borrador de la IA, sólo cuando el humano lo editó a mano (Plan §1.20.1). */
  generatedContent?: string;
  /** Si hay teléfono, suma un atajo para abrir WhatsApp con este texto ya cargado. */
  phone?: string | null;
  onConfirmed?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [confirmedSent, setConfirmedSent] = useState(false);
  const [savedAsExample, setSavedAsExample] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleCopy() {
    void navigator.clipboard.writeText(message).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleConfirm() {
    setError(null);
    const edited = Boolean(generatedContent);
    startTransition(async () => {
      const result = await confirmMessageSent({ leadId, message, generatedBy: "IA", kind, generatedContent });
      if (!result?.ok) {
        setError(result?.message ?? "No se pudo confirmar el envío.");
        return;
      }
      setConfirmedSent(true);
      setSavedAsExample(edited);
      router.refresh();
      onConfirmed?.();
    });
  }

  if (confirmedSent) {
    return (
      <div className="space-y-1">
        <p className="flex items-center gap-1.5 text-lm-success">
          <Check className="size-3.5" strokeWidth={1.5} />
          Registrado en la conversación.
        </p>
        {savedAsExample ? <p className="text-xs text-lm-ink-3">Se guardó tu versión como ejemplo de estilo.</p> : null}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {error ? <p className="text-xs text-lm-danger">{error}</p> : null}
      <div className="flex flex-wrap gap-2">
        {phone ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending || !message.trim()}
            onClick={() => window.open(buildWhatsappLink(phone, message), "_blank")}
          >
            <MessageCircle className="size-3.5" />
            Abrir WhatsApp
          </Button>
        ) : null}
        <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleCopy}>
          <Copy className="size-3.5" />
          {copied ? "Copiado" : "Copiar"}
        </Button>
        <Button type="button" variant="primary" size="sm" disabled={pending || !message.trim()} onClick={handleConfirm}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          {pending ? "Guardando…" : "Ya lo mandé"}
        </Button>
      </div>
    </div>
  );
}
