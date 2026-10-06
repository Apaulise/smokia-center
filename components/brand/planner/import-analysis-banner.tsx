"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { analyzeImportedReels } from "@/lib/brand/planner/actions";

/**
 * El aviso de §3.16: reels que se subieron a Instagram sin pasar por el
 * planificador y todavía no se leyeron. La sincronización analiza unos pocos
 * por corrida; este botón apura el resto, de a lote. Si no hay nada pendiente
 * ni fallido, no se muestra.
 */
export function ImportAnalysisBanner({ pending, failed }: { pending: number; failed: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  if (pending === 0 && failed === 0 && !message) return null;

  function run(retryFailed: boolean) {
    setMessage(null);
    startTransition(async () => {
      const result = await analyzeImportedReels({ retryFailed });
      if (!result.ok) {
        setMessage(result.message);
      } else {
        const parts = [`${result.analyzed} analizado${result.analyzed === 1 ? "" : "s"}`];
        if (result.failed > 0) parts.push(`${result.failed} con error`);
        if (result.remaining > 0) parts.push(`quedan ${result.remaining}`);
        setMessage(parts.join(" · "));
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lm-lg border border-lm-line bg-lm-raised px-4 py-3">
      <Sparkles className="size-4 shrink-0 text-lm-signal" aria-hidden />
      <p className="min-w-0 flex-1 text-[13px] leading-[1.5] text-lm-ink-2">
        {pending > 0
          ? `${pending} ${pending === 1 ? "reel importado espera" : "reels importados esperan"} que se lea su contenido (transcripción, hook e idea).`
          : "No quedan reels pendientes."}
        {failed > 0 ? ` ${failed} no se pudo${failed === 1 ? "" : "ieron"} analizar.` : null}
        {message ? <span className="ml-1.5 font-mono text-[12px] text-lm-ink-3">{message}</span> : null}
      </p>
      {pending > 0 ? (
        <Button type="button" variant="primary" className="h-8 px-3 text-[12.5px]" disabled={isPending} onClick={() => run(false)}>
          {isPending ? "Analizando…" : "Analizar ahora"}
        </Button>
      ) : null}
      {failed > 0 ? (
        <Button type="button" className="h-8 px-3 text-[12.5px]" disabled={isPending} onClick={() => run(true)}>
          Reintentar fallidos
        </Button>
      ) : null}
    </div>
  );
}
