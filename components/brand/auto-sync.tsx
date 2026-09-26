"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { syncBrandNow } from "@/lib/brand/actions";
import type { BrandPlatform } from "@/lib/brand/sources/types";

/**
 * Contador automático (Plans/03 §3.13): dispara una sincronización al entrar a
 * la sección /marca, sin importar la pantalla. Antes vivía duplicado en
 * BrandSyncPanel (sólo /marca) y en BrandChatPanel (sólo /marca/generar) — el
 * resto de las pantallas (contenido, planificador, análisis, competencia,
 * conocimiento) se quedaban con lo último que trajo el cron o una visita
 * anterior a esas dos. Vive en el layout de la sección porque un layout
 * compartido no se remonta al navegar entre sus páginas hijas: se dispara una
 * sola vez por entrada, igual que antes. El guard real (no sincroniza si hay
 * una corrida en curso o una reciente) está en el servidor, en runBrandSync.
 */
export function BrandAutoSync({ platform }: { platform: BrandPlatform }) {
  const router = useRouter();
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    synced.current = true;
    void syncBrandNow(platform, { onlyIfStale: true }).then((result) => {
      if (!result.skipped) router.refresh();
    });
  }, [platform, router]);

  return null;
}
