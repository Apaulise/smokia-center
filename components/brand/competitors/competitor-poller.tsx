"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { reconcileCompetitor } from "@/lib/brand/competitors/actions";

const POLL_INTERVAL_MS = 5000;

/**
 * Reconcilia las corridas de Apify que siguen en curso: una vez al abrir la
 * pantalla (cubre una corrida que terminó mientras no estabas) y cada pocos
 * segundos mientras queden pendientes. No dibuja nada.
 *
 * Es el reemplazo del webhook: Apify no puede avisar a localhost, y en
 * producción tampoco se registra uno para no sumar un segundo lugar que
 * saltee RLS (ver lib/brand/competitors/actions.ts). Es seguro que corra dos
 * veces o desde dos pestañas: el import es un upsert.
 */
export function CompetitorPoller({ pendingIds }: { pendingIds: string[] }) {
  const router = useRouter();
  // La lista viaja como string para que el efecto no se reinicie en cada render del padre.
  const key = pendingIds.join(",");
  const running = useRef(false);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    let cancelled = false;

    async function tick() {
      // Sin esto, un tick lento (dataset grande) se pisaría con el siguiente.
      if (running.current) return;
      running.current = true;
      try {
        const results = await Promise.all(ids.map((id) => reconcileCompetitor(id)));
        if (!cancelled && results.some((result) => result.status !== "EN_CURSO")) router.refresh();
      } catch {
        // un corte de red no debe romper la pantalla: el próximo tick reintenta
      } finally {
        running.current = false;
      }
    }

    void tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [key, router]);

  return null;
}
