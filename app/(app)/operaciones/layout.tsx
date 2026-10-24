import type { ReactNode } from "react";

import { OpsLiveRefresh } from "@/components/ops/live-refresh";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Mismo envoltorio visual que Leads y Marca. El refresco en vivo sólo se
 * monta con la URL pública de Supabase: sin eso el cliente no tiene a quién
 * suscribirse.
 */
export default async function OperacionesLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const canSubscribe = Boolean(user && process.env.NEXT_PUBLIC_SUPABASE_URL);

  return (
    <div className="min-h-dvh bg-lm-bg font-lm-sans text-lm-ink">
      {canSubscribe && user ? <OpsLiveRefresh ownerId={user.id} /> : null}
      {children}
    </div>
  );
}
