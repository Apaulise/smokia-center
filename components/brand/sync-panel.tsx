"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { syncBrandNow } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";

type BrandSyncJob = Database["public"]["Tables"]["brand_sync_jobs"]["Row"];

const STATUS_LABEL: Record<BrandSyncJob["status"], string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "Sincronizando",
  COMPLETADO: "Sincronizado",
  FALLIDO: "Falló",
};

const STATUS_TONE: Record<BrandSyncJob["status"], BadgeTone> = {
  PENDIENTE: "neutral",
  EN_CURSO: "cyan",
  COMPLETADO: "positive",
  FALLIDO: "danger",
};

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/**
 * "Sincronizar ahora" + estado de la última corrida (Plans/03 §3.2/§3.3).
 * A diferencia de scrape_jobs, acá la corrida ya terminó cuando la Server
 * Action devuelve — Windsor es pull síncrono, no hay proceso en background
 * que esperar. Realtime sirve para verla si el cron dispara una mientras la
 * pantalla está abierta, no para mostrar el progreso de este click.
 */
export function BrandSyncPanel({
  platform,
  ownerId,
  initialJob,
}: {
  platform: BrandPlatform;
  ownerId: string;
  initialJob: BrandSyncJob | null;
}) {
  const [job, setJob] = useState(initialJob);
  const [pending, startSync] = useTransition();
  const supabaseRef = useRef(createClient());
  const router = useRouter();

  useEffect(() => {
    const supabase = supabaseRef.current;
    const channel = supabase
      .channel(`brand_sync_jobs_${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "brand_sync_jobs", filter: `owner_id=eq.${ownerId}` },
        (payload) => {
          const row = payload.new as BrandSyncJob;
          if (row.platform !== platform) return;
          setJob(row);
          if (row.status === "COMPLETADO") router.refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ownerId, platform, router]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {job ? (
        <span className="flex items-center gap-2 text-sm text-muted">
          {job.status === "EN_CURSO" ? <Loader2 className="size-3.5 animate-spin text-cyan" /> : null}
          <Badge tone={STATUS_TONE[job.status]}>{STATUS_LABEL[job.status]}</Badge>
          {job.finished_at ? <span>última: {formatRelative(job.finished_at)}</span> : null}
          {job.status === "FALLIDO" && job.error ? <span className="text-danger">{job.error}</span> : null}
        </span>
      ) : null}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() =>
          startSync(async () => {
            await syncBrandNow(platform);
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
        Sincronizar ahora
      </Button>
    </div>
  );
}
