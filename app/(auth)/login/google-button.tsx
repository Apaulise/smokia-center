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
        <GoogleLogo />
        {pending ? "Redirigiendo…" : "Continuar con Google"}
      </Button>
      {error ? <p className="mt-3 text-[13px] text-lm-danger">{error}</p> : null}
    </>
  );
}

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" width={18} height={18} className="shrink-0" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}
