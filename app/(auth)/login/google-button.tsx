"use client";

import { useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { createClient } from "@/lib/supabase/client";

export function GoogleSignInButton({ next }: { next: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        // Supabase vuelve acá con un code que la ruta canjea por la sesión.
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setError(error.message);
      setPending(false);
    }
    // Si salió bien, el navegador ya se está yendo a Google: no se resetea
    // pending para que el botón no vuelva a habilitarse durante la redirección.
  }

  return (
    <>
      {/* Secundario (outline), no primario: en Design System §08 el amarillo es sólo para el submit por email. */}
      <Button variant="secondary" onClick={signIn} disabled={pending} className="h-10 w-full sm:h-12">
        {pending ? "Redirigiendo…" : "Continuar con Google"}
      </Button>
      {error ? <p className="mt-3 text-[13px] text-lm-danger">{error}</p> : null}
    </>
  );
}
