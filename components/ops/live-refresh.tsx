"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";

/** Cuando Mr. Pou escribe, la pantalla y el contador del sidebar se actualizan solos. */
export function OpsLiveRefresh({ ownerId }: { ownerId: string }) {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`ops_${ownerId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_approvals", filter: `owner_id=eq.${ownerId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_status", filter: `owner_id=eq.${ownerId}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ops_improvements", filter: `owner_id=eq.${ownerId}` },
        () => router.refresh(),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [ownerId, router]);

  return null;
}
