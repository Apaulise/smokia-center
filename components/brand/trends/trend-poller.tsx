"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { reconcileTrendSearch } from "@/lib/brand/trends/actions";

const POLL_INTERVAL_MS = 5000;

/**
 * Calco de CompetitorPoller (components/brand/competitors/competitor-poller.tsx),
 * contra las búsquedas de virales en curso. No dibuja nada.
 */
export function TrendPoller({ pendingIds }: { pendingIds: string[] }) {
  const router = useRouter();
  const key = pendingIds.join(",");
  const running = useRef(false);

  useEffect(() => {
    if (!key) return;
    const ids = key.split(",");
    let cancelled = false;

    async function tick() {
      if (running.current) return;
      running.current = true;
      try {
        const results = await Promise.all(ids.map((id) => reconcileTrendSearch(id)));
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
