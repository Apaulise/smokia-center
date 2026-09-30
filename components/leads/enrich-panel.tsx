"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { CopilotChip, CopilotLabel, SmokeLines } from "@/components/leads/ui/copilot";
import { ANGLE_LABEL, type SalesAngle } from "@/lib/leads/ai/angles";
import { enrichOneLead } from "@/lib/leads/ai/actions";
import type { EnrichmentResult, WebPresenceStatus } from "@/lib/leads/ai/enrich";

const CONFIDENCE_LABEL: Record<EnrichmentResult["confidence"], string> = {
  BAJA: "Confianza baja",
  MEDIA: "Confianza media",
  ALTA: "Confianza alta",
};

const WEB_PRESENCE_LABEL: Record<WebPresenceStatus, string> = {
  DOMINIO_PROPIO: "Sitio propio",
  DOMINIO_GRATUITO_O_CONSTRUCTOR: "Sitio en dominio gratuito/constructor",
  SOLO_REDES_SOCIALES: "Sin sitio — sólo redes",
  SIN_PRESENCIA_DIGITAL: "Sin presencia digital",
  SIN_VERIFICAR: "Presencia web sin verificar",
};

/** Estados donde vale la pena ofrecer un sitio de cortesía — el motivo por el que este chip existe. */
const WEB_PRESENCE_OPPORTUNITY: Set<WebPresenceStatus> = new Set(["SOLO_REDES_SOCIALES", "SIN_PRESENCIA_DIGITAL"]);

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <CopilotLabel>{title}</CopilotLabel>
      <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[13px] text-lm-ink">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Enriquecimiento del lead (Plan §1.10, Design System Copilot §ENRIQUECIMIENTO):
 * el análisis comercial de Gemini (SPA §4) antes del primer contacto.
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

  if (pending) {
    return (
      <div className="flex flex-col gap-2">
        <CopilotLabel>Enriqueciendo…</CopilotLabel>
        <SmokeLines count={3} />
      </div>
    );
  }

  // Fallback para análisis guardados antes de sumarse este campo (blob opaco, sin migración de datos viejos).
  const webPresenceStatus: WebPresenceStatus = enrichment?.webPresence?.status ?? "SIN_VERIFICAR";

  return (
    <div className="flex flex-col gap-3">
      {enrichment ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-lm-ink-3">
            <span>{CONFIDENCE_LABEL[enrichment.confidence]}</span>
            {enrichment.recommendedSalesAngle ? (
              <span className="text-lm-signal-text">{ANGLE_LABEL[enrichment.recommendedSalesAngle as SalesAngle]}</span>
            ) : null}
          </div>
          <p className="text-[13px] text-lm-ink">{enrichment.businessSummary}</p>
          <List title="Servicios detectados" items={enrichment.detectedServices} />
          {enrichment.possibleDecisionMaker ? (
            <div>
              <CopilotLabel>Posible decisor</CopilotLabel>
              <p className="mt-1 text-[13px] text-lm-ink">{enrichment.possibleDecisionMaker}</p>
            </div>
          ) : null}
          <List title="Señales de operación" items={enrichment.operationSignals} />
          <List title="Señales de tecnología" items={enrichment.technologySignals} />
          {webPresenceStatus !== "SIN_VERIFICAR" ? (
            <div>
              <CopilotLabel>Presencia web</CopilotLabel>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <CopilotChip variant={WEB_PRESENCE_OPPORTUNITY.has(webPresenceStatus) ? "signal" : "pain"}>
                  {WEB_PRESENCE_LABEL[webPresenceStatus]}
                </CopilotChip>
                {WEB_PRESENCE_OPPORTUNITY.has(webPresenceStatus) ? (
                  <span className="text-[13px] text-lm-signal-text">Oportunidad: sitio de cortesía</span>
                ) : null}
              </div>
              {enrichment.webPresence?.detail ? <p className="mt-1 text-[13px] text-lm-ink-2">{enrichment.webPresence.detail}</p> : null}
            </div>
          ) : null}
          {enrichment.possiblePains.length > 0 ? (
            <div>
              <CopilotLabel>Posibles dolores (hipótesis, sin confirmar)</CopilotLabel>
              <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[13px] text-lm-ink">
                {enrichment.possiblePains.map((pain, index) => (
                  <li key={index}>{pain.description}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-[13px] text-lm-ink-2">Sin análisis todavía. Enriquecé el lead para empezar.</p>
      )}

      {error ? <p className="text-[13px] text-lm-danger">{error}</p> : null}

      <Button type="button" variant="secondary" size="sm" className="w-max" onClick={handleEnrich}>
        <Sparkles className="size-3.5" strokeWidth={1.5} />
        {enrichment ? "Volver a enriquecer" : "Enriquecer"}
      </Button>
    </div>
  );
}
