"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { generateBrandAnalysis } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";

/**
 * "Generar análisis" (§3.5). Sin Realtime a propósito: a diferencia de
 * Windsor (sync-panel.tsx), acá la Server Action no vuelve hasta que Claude
 * termina — el estado "pending" del botón ES el progreso, no hay una fila de
 * job que seguir.
 */
export function GenerateAnalysisPanel({ platform }: { platform: BrandPlatform }) {
  const [pending, startGenerate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startGenerate(async () => {
            setError(null);
            const result = await generateBrandAnalysis(platform);
            if (result.ok) {
              router.refresh();
            } else {
              setError(result.message);
            }
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {pending ? "Analizando…" : "Generar análisis"}
      </Button>
      {error ? <p className="max-w-xs text-right text-xs text-danger">{error}</p> : null}
    </div>
  );
}
