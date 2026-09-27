"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { rewriteLeadMessage } from "@/lib/leads/ai/actions";
import { REWRITE_TONES, type RewriteTone } from "@/lib/leads/ai/rewrite-tones";

const TONE_LABEL: Record<RewriteTone, string> = {
  MAS_CORTO: "Más corto",
  MAS_INFORMAL: "Más informal",
  MAS_DIRECTO: "Más directo",
};

/**
 * Los tres botones de reescritura del SPA §24. Compartido entre la apertura
 * (§1.11) y la respuesta sugerida del analizador (§1.12/§1.15): Sonnet 5, no
 * persiste nada — sólo reemplaza el texto en pantalla.
 */
export function RewriteButtons({ message, onRewrite, disabled }: { message: string; onRewrite: (text: string) => void; disabled?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [busyTone, setBusyTone] = useState<RewriteTone | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClick(tone: RewriteTone) {
    setError(null);
    setBusyTone(tone);
    startTransition(async () => {
      const result = await rewriteLeadMessage(message, tone);
      setBusyTone(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      onRewrite(result.message);
    });
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {REWRITE_TONES.map((tone) => (
          <Button
            key={tone}
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || pending || !message.trim()}
            onClick={() => handleClick(tone)}
          >
            {busyTone === tone ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {TONE_LABEL[tone]}
          </Button>
        ))}
      </div>
      {error ? <p className="text-xs text-lm-danger">{error}</p> : null}
    </div>
  );
}
