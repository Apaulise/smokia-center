"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { generateBrandAnalysis } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";

/**
 * "Generar análisis" (§3.5). Sin Realtime a propósito: a diferencia de
 * la API de Instagram (sync-panel.tsx), acá la Server Action no vuelve hasta que Claude
 * termina — el estado "pending" del botón ES el progreso, no hay una fila de
 * job que seguir.
 *
 * Un análisis nuevo reemplaza las recomendaciones NUEVAS del anterior (las
 * aplicadas y descartadas quedan de historial). Si hay alguna sin ninguna
 * acción tomada se pregunta una vez antes — es lo único que se pierde.
 */
export function GenerateAnalysisPanel({
  platform,
  pendingCount,
}: {
  platform: BrandPlatform;
  /** Cuántas recomendaciones NUEVAS (sin acción) hay hoy: son las que un análisis nuevo reemplaza. */
  pendingCount: number;
}) {
  const [pending, startGenerate] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function generate() {
    setConfirming(false);
    startGenerate(async () => {
      setError(null);
      const result = await generateBrandAnalysis(platform);
      if (result.ok) {
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant="primary"
        className="h-[34px] px-3.5 text-[13px]"
        disabled={pending}
        onClick={() => (pendingCount > 0 ? setConfirming(true) : generate())}
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {pending ? "Analizando…" : "Generar análisis"}
      </Button>
      {error ? <p className="max-w-xs text-right text-xs text-lm-danger">{error}</p> : null}

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reemplazar recomendaciones"
        description="Un análisis nuevo reemplaza a las recomendaciones nuevas de ahora."
      >
        <p className="text-[13px] leading-normal text-lm-ink-2">
          Hay {pendingCount} {pendingCount === 1 ? "recomendación nueva" : "recomendaciones nuevas"} sin ninguna acción tomada:
          se van a borrar cuando termine el análisis. Las aplicadas y las descartadas se conservan en el historial.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={generate}>
            Reemplazar y generar
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
