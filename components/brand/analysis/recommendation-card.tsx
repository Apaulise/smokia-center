"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { parseEvidence, type EvidencePost } from "./evidence";
import { PostThumb } from "@/components/brand/post-thumb";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { updateBrandRecommendationStatus } from "@/lib/brand/actions";
import type { Database } from "@/lib/supabase/database.types";

type Recommendation = Database["public"]["Tables"]["brand_recommendations"]["Row"];

const KIND_LABEL: Record<Recommendation["kind"], string> = { REPETIR: "Repetir", CORTAR: "Cortar", PROBAR: "Probar" };
// Repetir = seguir haciendo algo que ya funciona (positive), cortar = dejar
// de hacer algo que rinde mal (danger), probar = experimentar (violeta =
// proceso/innovación, manual §9).
const KIND_TONE: Record<Recommendation["kind"], BadgeTone> = { REPETIR: "positive", CORTAR: "danger", PROBAR: "violet" };

const STATUS_LABEL: Record<Recommendation["status"], string> = { NUEVA: "Nueva", APLICADA: "Aplicada", DESCARTADA: "Descartada" };
const STATUS_TONE: Record<Recommendation["status"], BadgeTone> = { NUEVA: "cyan", APLICADA: "positive", DESCARTADA: "neutral" };

const POST_KIND_LABEL: Record<EvidencePost["kind"], string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

export function RecommendationCard({
  recommendation,
  evidencePosts,
}: {
  recommendation: Recommendation;
  /** Las piezas citadas en `evidence.postIds`, ya resueltas por la página (miniatura y tipo). */
  evidencePosts: EvidencePost[];
}) {
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

  const hasEvidence = evidence.summary || Object.keys(evidence.metrics).length > 0 || evidencePosts.length > 0;

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
          <div className="space-y-3 rounded-[12px] border border-line/60 bg-surface/40 p-3 text-xs text-muted">
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
            {evidencePosts.length > 0 ? (
              <div className="flex flex-wrap gap-3 pt-1">
                {evidencePosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/marca/contenido/${post.id}`}
                    title={post.caption ?? POST_KIND_LABEL[post.kind]}
                    className="group w-14 space-y-1"
                  >
                    <PostThumb url={post.thumbnailUrl} className="w-14 transition-colors group-hover:border-cyan/50" />
                    <span className="block truncate text-center text-[11px] text-muted group-hover:text-cyan">
                      {POST_KIND_LABEL[post.kind]}
                    </span>
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
