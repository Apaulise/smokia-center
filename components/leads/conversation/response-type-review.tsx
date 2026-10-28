"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { reviewLeadMessageResponseType } from "@/lib/leads/message-actions";
import type { ResponseType } from "@/lib/leads/message-analysis";
import { cn } from "@/lib/utils";

const LABEL: Record<ResponseType, string> = {
  AUTORESPUESTA: "Autorespuesta",
  HUMANA: "Respuesta humana",
};

export function ResponseTypeReview({
  messageId,
  aiResponseType,
  value,
  reviewed = false,
  compact = false,
  onReviewed,
}: {
  messageId: string;
  aiResponseType: ResponseType;
  value: ResponseType;
  reviewed?: boolean;
  compact?: boolean;
  onReviewed?: (value: ResponseType, nextActionReason?: string) => void;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(value);
  const [confirmed, setConfirmed] = useState(reviewed);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ResponseType) {
    if (pending || (next === current && confirmed)) return;
    setError(null);
    setSavedMessage(null);
    startTransition(async () => {
      const result = await reviewLeadMessageResponseType({ messageId, responseType: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCurrent(next);
      setConfirmed(true);
      setSavedMessage(result.latest ? "Clasificación guardada y próxima acción recalculada." : "Clasificación histórica guardada.");
      onReviewed?.(next, result.nextActionReason);
      router.refresh();
    });
  }

  return (
    <div className={cn("rounded-lm-sm border border-lm-line bg-lm-surface", compact ? "mt-2 p-2" : "p-3")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium text-lm-ink">¿La IA clasificó bien esta respuesta?</p>
          <p className="mt-0.5 text-[11px] text-lm-ink-3">
            La IA indicó: {LABEL[aiResponseType]}. Elegí la clasificación correcta.
          </p>
        </div>
        <div className="inline-flex rounded-lm-sm border border-lm-line bg-lm-raised p-0.5">
          {(["HUMANA", "AUTORESPUESTA"] as const).map((type) => (
            <button
              key={type}
              type="button"
              disabled={pending}
              onClick={() => choose(type)}
              aria-pressed={current === type}
              className={cn(
                "flex h-7 items-center gap-1 rounded-[3px] px-2.5 text-xs transition-colors disabled:opacity-50",
                current === type ? "bg-lm-surface font-medium text-lm-ink" : "text-lm-ink-3 hover:text-lm-ink",
              )}
            >
              {pending && current !== type ? <Loader2 className="size-3 animate-spin" /> : current === type ? <Check className="size-3" /> : null}
              {LABEL[type]}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="mt-2 text-xs text-lm-danger">{error}</p> : null}
      {savedMessage ? <p className="mt-2 text-xs text-lm-success">{savedMessage}</p> : null}
    </div>
  );
}
