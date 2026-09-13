"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up";

/**
 * Login temporal por email/contraseña — reemplaza a Google mientras el
 * consent screen de OAuth no está configurado (ver GoogleSignInButton en
 * login/page.tsx). Sirve además para crear un segundo usuario de prueba y
 * validar RLS (Plan 01, paso de verificación 3).
 *
 * El proyecto de Supabase pide confirmar el mail al registrarse
 * (mailer_autoconfirm = false), así que "Crear cuenta" no deja sesión
 * iniciada al toque: hay que abrir el link que llega por mail.
 */
export function EmailSignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUp, setSignedUp] = useState(false);

  async function onSubmit(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    setPending(true);
    setError(null);
    setSignedUp(false);

    const formData = new FormData(formEvent.currentTarget);
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");

    const supabase = createClient();

    if (mode === "sign-up") {
      const { error } = await supabase.auth.signUp({ email, password });
      setPending(false);
      if (error) {
        setError(error.message);
        return;
      }
      setSignedUp(true);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setPending(false);
      return;
    }
    router.push(next);
    router.refresh();
  }

  return (
    <div>
      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label htmlFor="email" className="mb-1.5 block text-xs text-muted">
            Email
          </label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label htmlFor="password" className="mb-1.5 block text-xs text-muted">
            Contraseña
          </label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={6}
            required
          />
        </div>

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
          {pending
            ? "Un momento…"
            : mode === "sign-in"
              ? "Ingresar"
              : "Crear cuenta"}
        </Button>
      </form>

      {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
      {signedUp ? (
        <p className="mt-3 text-sm text-positive">
          Cuenta creada. Confirmá el mail que te llegó para poder ingresar.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          setMode((current) => (current === "sign-in" ? "sign-up" : "sign-in"));
          setError(null);
          setSignedUp(false);
        }}
        className="mt-4 text-sm text-muted underline-offset-4 hover:text-cyan hover:underline"
      >
        {mode === "sign-in" ? "¿No tenés cuenta? Crear una" : "¿Ya tenés cuenta? Ingresar"}
      </button>
    </div>
  );
}
