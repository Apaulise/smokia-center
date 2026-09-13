"use client";

import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { reconcileJob } from "@/lib/leads/actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type ScrapeJob = Database["public"]["Tables"]["scrape_jobs"]["Row"];

const STATUS_LABEL: Record<ScrapeJob["status"], string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  FALLIDO: "Fallido",
};

const STATUS_TONE: Record<ScrapeJob["status"], BadgeTone> = {
  PENDIENTE: "neutral",
  EN_CURSO: "cyan",
  COMPLETADO: "positive",
  FALLIDO: "danger",
};

/**
 * Progreso en vivo de una corrida: se suscribe por Realtime a la fila de
 * scrape_jobs (Plan §1.2, paso 3) y además dispara el "chequeo al abrir la
 * pantalla" (paso 5) porque en desarrollo Apify nunca llega a localhost.
 *
 * Realtime es de mejor esfuerzo, no garantía: un websocket puede caerse o
 * demorar en reconectar (pestaña en segundo plano, blip de red) y el evento
 * de UPDATE se pierde. Por eso cada reconciliación manual o al montar hace un
 * refetch directo después, en vez de esperar sólo al canal.
 */
export function JobStatusPanel({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<ScrapeJob | null>(null);
  const [refreshPending, startRefresh] = useTransition();
  const supabaseRef = useRef(createClient());

  const refetch = useCallback(async () => {
    const { data } = await supabaseRef.current
      .from("scrape_jobs")
      .select("*")
      .eq("id", jobId)
      .maybeSingle();
    if (data) setJob(data);
  }, [jobId]);

  useEffect(() => {
    let active = true;
    const supabase = supabaseRef.current;

    void refetch();

    void reconcileJob(jobId).then(() => {
      if (active) void refetch();
    });

    const channel = supabase
      .channel(`scrape_job_${jobId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "scrape_jobs", filter: `id=eq.${jobId}` },
        (payload) => {
          if (active) setJob(payload.new as ScrapeJob);
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [jobId, refetch]);

  if (!job) return null;

  const isTerminal = job.status === "COMPLETADO" || job.status === "FALLIDO";

  return (
    <Card glow={job.status === "EN_CURSO" ? "cyan" : undefined}>
      <CardHeader
        title={
          <span className="flex items-center gap-2">
            {job.status === "COMPLETADO" ? (
              <CheckCircle2 className="size-4 text-positive" />
            ) : job.status === "FALLIDO" ? (
              <XCircle className="size-4 text-danger" />
            ) : (
              <Loader2 className="size-4 animate-spin text-cyan" />
            )}
            Generando lista
          </span>
        }
        description={job.error ?? undefined}
        action={<Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>}
      />
      <CardBody className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-sm text-muted">
          <p className="tabular text-ink">{job.items_imported} leads nuevos</p>
          {job.cost_usd != null ? <p className="tabular mt-1">Costo: US$ {job.cost_usd.toFixed(2)}</p> : null}
        </div>
        {!isTerminal ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={refreshPending}
            onClick={() =>
              startRefresh(async () => {
                await reconcileJob(jobId);
                await refetch();
              })
            }
          >
            {refreshPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Actualizar ahora
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}
