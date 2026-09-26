"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { enrichLeadListBatch } from "@/lib/leads/ai/actions";

/** "Enriquecer lista" (Plan §1.10): dispara el lote en segundo plano — no hay progreso en vivo, se refresca a mano. */
export function EnrichListButton({ leadListId }: { leadListId: string }) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await enrichLeadListBatch(leadListId);
            setMessage(result?.message ?? null);
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        Enriquecer lista
      </Button>
      {message ? <span className="text-xs text-muted">{message}</span> : null}
    </div>
  );
}
