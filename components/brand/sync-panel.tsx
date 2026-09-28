"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/leads/ui/button";
import { syncBrandNow } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type BrandSyncJob = Database["public"]["Tables"]["brand_sync_jobs"]["Row"];

interface SyncContextValue {
  job: BrandSyncJob | null;
  pending: boolean;
  sync: () => void;
}

const SyncContext = createContext<SyncContextValue | null>(null);

function useSync() {
  const value = useContext(SyncContext);
  if (!value) throw new Error("SyncStatus/SyncButton van dentro de BrandSyncProvider");
  return value;
}

function formatRelative(iso: string) {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "recién";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/**
 * Estado de la sincronización + el botón "Sincronizar ahora" (Plans/03 §3.2/§3.3).
 * El estado va en el header bar y el botón en el encabezado de la página, así
 * que comparten un proveedor en vez de dos suscripciones a Realtime.
 *
 * A diferencia de scrape_jobs, acá la corrida ya terminó cuando la Server
 * Action devuelve — Windsor es pull síncrono, no hay proceso en background
 * que esperar. Realtime sirve para verla si el cron dispara una mientras la
 * pantalla está abierta, no para mostrar el progreso de este click.
 */
export function BrandSyncProvider({
  platform,
  ownerId,
  initialJob,
  children,
}: {
  platform: BrandPlatform;
  ownerId: string;
  initialJob: BrandSyncJob | null;
  children: ReactNode;
}) {
  const [job, setJob] = useState(initialJob);
  const [prevInitialJob, setPrevInitialJob] = useState(initialJob);
  // useState ignora las props nuevas: sin esto el estado queda viejo tras router.refresh().
  if (initialJob !== prevInitialJob) {
    setPrevInitialJob(initialJob);
    setJob(initialJob);
  }
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

  function sync() {
    startSync(async () => {
      await syncBrandNow(platform);
      router.refresh();
    });
  }

  return <SyncContext.Provider value={{ job, pending, sync }}>{children}</SyncContext.Provider>;
}

/** "● Sincronizado · hace 1 h", para el header bar. */
export function SyncStatus() {
  const { job, pending } = useSync();

  const running = pending || job?.status === "EN_CURSO";
  const failed = !running && job?.status === "FALLIDO";
  const label = running
    ? "Sincronizando…"
    : failed
      ? "Falló la sincronización"
      : job?.finished_at
        ? `Sincronizado · ${formatRelative(job.finished_at)}`
        : "Sin sincronizar";

  return (
    <span className="flex items-center gap-1.5" title={failed && job?.error ? job.error : undefined}>
      <span
        className={cn(
          "size-1.5 rounded-full",
          running && "animate-pulse bg-lm-signal",
          failed && "bg-lm-danger",
          !running && !failed && (job?.finished_at ? "bg-lm-success" : "bg-lm-smoke-3"),
        )}
      />
      {label}
    </span>
  );
}

export function SyncButton() {
  const { pending, sync } = useSync();

  return (
    <Button type="button" variant="secondary" disabled={pending} onClick={sync}>
      {pending ? <Loader2 className="size-[13px] animate-spin" /> : <RefreshCw className="size-[13px]" />}
      Sincronizar ahora
    </Button>
  );
}
