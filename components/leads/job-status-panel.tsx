"use client";

import { CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button, ButtonLink } from "@/components/leads/ui/button";
import { Panel } from "@/components/leads/ui/section";
import { StatusBadge } from "@/components/leads/ui/status-badge";
import type { StatusTemperatureGroup } from "@/lib/leads/status";
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

const STATUS_GROUP: Record<ScrapeJob["status"], StatusTemperatureGroup> = {
  PENDIENTE: "frio",
  EN_CURSO: "curso",
  COMPLETADO: "ganado",
  FALLIDO: "salida",
};

/**
 * Progreso en vivo de una corrida (§04.C): se suscribe por Realtime a la fila
 * de scrape_jobs (Plan §1.2, paso 3) y además dispara el "chequeo al abrir la
 * pantalla" (paso 5) porque en desarrollo Apify nunca llega a localhost.
 *
 * El mock muestra un contador "12/20" con el objetivo a la vista; acá no hay
 * un campo de "cantidad pedida" homogéneo entre proveedores (vive dentro de
 * `input`, con nombre distinto por proveedor), así que se mantiene el conteo
 * simple de `items_imported` con una barra indeterminada mientras corre.
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
    const { data } = await supabaseRef.current.from("scrape_jobs").select("*").eq("id", jobId).maybeSingle();
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

  // Red de seguridad: si el webhook o el evento de Realtime no llegan, mientras la
  // corrida no termine se reconcilia sola cada pocos segundos (idempotente).
  const terminal = job?.status === "COMPLETADO" || job?.status === "FALLIDO";
  useEffect(() => {
    if (!job || terminal) return;
    const timer = setInterval(() => {
      void reconcileJob(jobId).then(() => refetch());
    }, 5000);
    return () => clearInterval(timer);
  }, [job, terminal, jobId, refetch]);

  if (!job) return null;

  const isTerminal = job.status === "COMPLETADO" || job.status === "FALLIDO";
  const running = job.status === "EN_CURSO";

  return (
    <Panel className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          {job.status === "COMPLETADO" ? (
            <CheckCircle2 className="size-4 text-lm-success" strokeWidth={1.5} />
          ) : job.status === "FALLIDO" ? (
            <XCircle className="size-4 text-lm-danger" strokeWidth={1.5} />
          ) : (
            <Loader2 className="size-4 animate-spin text-lm-signal-text" strokeWidth={1.5} />
          )}
          <div>
            <p className="font-lm-sans text-[13px] font-semibold text-lm-ink">Generando lista</p>
            {job.error ? <p className="mt-0.5 text-xs text-lm-danger">{job.error}</p> : null}
          </div>
        </div>
        <StatusBadge group={STATUS_GROUP[job.status]}>{STATUS_LABEL[job.status]}</StatusBadge>
      </div>

      {running ? (
        <div className="mt-3 h-1 overflow-hidden rounded-lm-xs bg-lm-smoke-1">
          <div className="lm-smoke h-full w-1/3" />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-lm-line pt-3">
        <div className="font-mono text-[13px] tabular-nums text-lm-ink-2">
          <span className="text-lm-ink">{job.items_imported}</span> leads nuevos
          {job.cost_usd != null ? <span className="ml-3">Costo: US$ {job.cost_usd.toFixed(2)}</span> : null}
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
            {refreshPending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" strokeWidth={1.5} />}
            Actualizar ahora
          </Button>
        ) : null}
        {job.status === "COMPLETADO" ? (
          <ButtonLink href={`/leads/lista/${job.lead_list_id}`} size="sm">
            Ir a la lista
          </ButtonLink>
        ) : null}
      </div>
    </Panel>
  );
}
