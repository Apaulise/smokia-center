"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { ANGLE_LABEL, type SalesAngle } from "@/lib/leads/ai/angles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { enrichOneLead } from "@/lib/leads/ai/actions";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";

const CONFIDENCE_LABEL: Record<EnrichmentResult["confidence"], string> = {
  BAJA: "Confianza baja",
  MEDIA: "Confianza media",
  ALTA: "Confianza alta",
};

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted">{title}</p>
      <ul className="list-inside list-disc space-y-0.5 text-sm text-ink">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Enriquecimiento del lead (Plan §1.10): el análisis comercial de Gemini
 * (SPA §4) antes del primer contacto. Sin resultado todavía, sólo el botón.
 */
export function EnrichPanel({ leadId, enrichment }: { leadId: string; enrichment: EnrichmentResult | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleEnrich() {
    setError(null);
    startTransition(async () => {
      const result = await enrichOneLead(leadId);
      if (!result?.ok) {
        setError(result?.message ?? "No se pudo enriquecer el lead.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3 text-sm">
      {enrichment ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={enrichment.confidence === "ALTA" ? "positive" : enrichment.confidence === "MEDIA" ? "cyan" : "neutral"}>
              {CONFIDENCE_LABEL[enrichment.confidence]}
            </Badge>
            {enrichment.recommendedSalesAngle ? (
              <Badge tone="violet">{ANGLE_LABEL[enrichment.recommendedSalesAngle as SalesAngle]}</Badge>
            ) : null}
          </div>
          <p className="text-ink">{enrichment.businessSummary}</p>
          <List title="Servicios detectados" items={enrichment.detectedServices} />
          {enrichment.possibleDecisionMaker ? (
            <div>
              <p className="mb-1 text-xs text-muted">Posible decisor</p>
              <p className="text-ink">{enrichment.possibleDecisionMaker}</p>
            </div>
          ) : null}
          <List title="Señales de operación" items={enrichment.operationSignals} />
          <List title="Señales de tecnología" items={enrichment.technologySignals} />
          {enrichment.possiblePains.length > 0 ? (
            <div>
              <p className="mb-1 text-xs text-muted">Posibles dolores (hipótesis, sin confirmar)</p>
              <ul className="list-inside list-disc space-y-0.5 text-sm text-ink">
                {enrichment.possiblePains.map((pain, index) => (
                  <li key={index}>{pain.description}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted">Todavía no se enriqueció este lead.</p>
      )}

      {error ? <p className="text-danger">{error}</p> : null}

      <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={handleEnrich}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
        {enrichment ? "Volver a enriquecer" : "Enriquecer"}
      </Button>
    </div>
  );
}
