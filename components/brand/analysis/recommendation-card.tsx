"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { updateBrandRecommendationStatus } from "@/lib/brand/actions";
import type { Database } from "@/lib/supabase/database.types";

type Recommendation = Database["public"]["Tables"]["brand_recommendations"]["Row"];
type Evidence = { summary: string; postIds: string[]; metrics: Record<string, number | string> };

const KIND_LABEL: Record<Recommendation["kind"], string> = { REPETIR: "Repetir", CORTAR: "Cortar", PROBAR: "Probar" };
// Repetir = seguir haciendo algo que ya funciona (positive), cortar = dejar
// de hacer algo que rinde mal (danger), probar = experimentar (violeta =
// proceso/innovación, manual §9).
const KIND_TONE: Record<Recommendation["kind"], BadgeTone> = { REPETIR: "positive", CORTAR: "danger", PROBAR: "violet" };

const STATUS_LABEL: Record<Recommendation["status"], string> = { NUEVA: "Nueva", APLICADA: "Aplicada", DESCARTADA: "Descartada" };
const STATUS_TONE: Record<Recommendation["status"], BadgeTone> = { NUEVA: "cyan", APLICADA: "positive", DESCARTADA: "neutral" };

/** evidence llega como Json (jsonb genérico) — se valida en el borde, igual que cualquier dato de terceros (CLAUDE.md §5). */
function parseEvidence(raw: Recommendation["evidence"]): Evidence {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return { summary: "", postIds: [], metrics: {} };
  const record = raw as Record<string, unknown>;
  return {
    summary: typeof record.summary === "string" ? record.summary : "",
    postIds: Array.isArray(record.postIds) ? record.postIds.filter((id): id is string => typeof id === "string") : [],
    metrics:
      typeof record.metrics === "object" && record.metrics !== null && !Array.isArray(record.metrics)
        ? (record.metrics as Record<string, number | string>)
        : {},
  };
}

export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const evidence = parseEvidence(recommendation.evidence);
  const isTerminal = recommendation.status !== "NUEVA";

  function setStatus(status: Recommendation["status"]) {
    startTransition(async () => {
      await updateBrandRecommendationStatus(recommendation.id, status);
      router.refresh();
    });
  }

  const hasEvidence = evidence.summary || Object.keys(evidence.metrics).length > 0 || evidence.postIds.length > 0;

  return (
    <Card>
      <CardHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={KIND_TONE[recommendation.kind]}>{KIND_LABEL[recommendation.kind]}</Badge>
            {recommendation.title}
          </span>
        }
        action={<Badge tone={STATUS_TONE[recommendation.status]}>{STATUS_LABEL[recommendation.status]}</Badge>}
      />
      <CardBody className="space-y-4">
        <p className="text-sm whitespace-pre-wrap text-ink">{recommendation.body}</p>

        {hasEvidence ? (
          <div className="space-y-2 rounded-[12px] border border-line/60 bg-surface/40 p-3 text-xs text-muted">
            {evidence.summary ? <p>{evidence.summary}</p> : null}
            {Object.keys(evidence.metrics).length > 0 ? (
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3">
                {Object.entries(evidence.metrics).map(([key, value]) => (
                  <div key={key} className="flex justify-between gap-2">
                    <dt className="truncate">{key}</dt>
                    <dd className="tabular text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
            {evidence.postIds.length > 0 ? (
              <div className="flex flex-wrap gap-3 pt-1">
                {evidence.postIds.map((id, i) => (
                  <Link key={id} href={`/marca/contenido/${id}`} className="text-cyan hover:underline">
                    Ver post {i + 1}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {!isTerminal ? (
          <div className="flex gap-2">
            <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => setStatus("APLICADA")}>
              <Check className="size-3.5" />
              Marcar aplicada
            </Button>
            <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => setStatus("DESCARTADA")}>
              <X className="size-3.5" />
              Descartar
            </Button>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
