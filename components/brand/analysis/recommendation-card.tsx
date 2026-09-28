"use client";

import { Check, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { parseEvidence, type EvidencePost } from "./evidence";
import { PostThumb } from "@/components/brand/post-thumb";
import { Card, Eyebrow, Tag } from "@/components/brand/ui/card";
import { Button } from "@/components/leads/ui/button";
import { updateBrandRecommendationStatus } from "@/lib/brand/actions";
import type { Database } from "@/lib/supabase/database.types";

type Recommendation = Database["public"]["Tables"]["brand_recommendations"]["Row"];

const KIND_LABEL: Record<Recommendation["kind"], string> = { REPETIR: "Repetir", CORTAR: "Cortar", PROBAR: "Probar" };

const STATUS_LABEL: Record<Recommendation["status"], string> = { NUEVA: "NUEVA", APLICADA: "APLICADA", DESCARTADA: "DESCARTADA" };

// SOC §16: no se optimiza todo para lo mismo — el objetivo es de lectura
// neutral (ni "buena" ni "mala" noticia como REPETIR/CORTAR).
const OBJECTIVE_LABEL: Record<NonNullable<Recommendation["objective"]>, string> = {
  ALCANCE: "Alcance",
  AUTORIDAD: "Autoridad",
  CONVERSION: "Conversión",
};

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
      <div className="flex items-center gap-2.5 border-b border-lm-line px-5 py-4">
        <Tag tone="solid" size="md">
          {KIND_LABEL[recommendation.kind]}
        </Tag>
        {recommendation.objective ? <Tag size="md">{OBJECTIVE_LABEL[recommendation.objective]}</Tag> : null}
        <h4 className="ml-1 min-w-0 flex-1 font-lm-sans text-[15px] leading-5 font-medium">{recommendation.title}</h4>
        <span className="font-mono text-[11px] text-lm-ink-3">{STATUS_LABEL[recommendation.status]}</span>
      </div>

      <div className="grid grid-cols-1 gap-7 px-5 pt-[18px] pb-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <p className="text-[13.5px] leading-[1.65] whitespace-pre-wrap text-lm-smoke-5">{recommendation.body}</p>

        <div className="flex flex-col gap-3">
          {hasEvidence ? (
            <>
              <Eyebrow>Evidencia</Eyebrow>
              {evidence.summary ? <p className="text-[12.5px] leading-[1.55] text-lm-ink-2">{evidence.summary}</p> : null}
              {Object.keys(evidence.metrics).length > 0 ? (
                <dl className="flex flex-col gap-1 text-xs text-lm-ink-2">
                  {Object.entries(evidence.metrics).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-3">
                      <dt className="truncate">{key}</dt>
                      <dd className="font-mono text-lm-ink tabular-nums">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {evidencePosts.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {evidencePosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/marca/contenido/${post.id}`}
                      title={post.caption ?? POST_KIND_LABEL[post.kind]}
                      className="transition-opacity hover:opacity-80"
                    >
                      <PostThumb url={post.thumbnailUrl} className="aspect-auto h-[72px] w-[52px]" />
                    </Link>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}

          {!isTerminal ? (
            <div className="flex gap-2 pt-1">
              <Button type="button" variant="secondary" disabled={pending} onClick={() => setStatus("APLICADA")}>
                <Check className="size-3.5" />
                Marcar aplicada
              </Button>
              <Button type="button" variant="ghost" disabled={pending} onClick={() => setStatus("DESCARTADA")}>
                <X className="size-3.5" />
                Descartar
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
