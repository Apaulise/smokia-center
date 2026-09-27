"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Input } from "@/components/leads/ui/field";
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
 * iniciada al toque: hay que abrir el link que llega por mail. `mode` es
 * controlado por `LoginScreen` (Design System §08): la cita del panel de
 * marca cambia con sign-in/sign-up, así que ese estado vive un nivel arriba.
 */
export function EmailSignInForm({
  next,
  mode,
  onModeChange,
}: {
  next: string;
  mode: Mode;
  onModeChange: (mode: Mode) => void;
}) {
  const router = useRouter();
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
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" autoComplete="email" required className="h-10 sm:h-12" />
        </Field>
        <Field label="Contraseña" htmlFor="password">
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
            minLength={6}
            required
            className="h-10 sm:h-12"
          />
        </Field>

        <Button type="submit" variant="primary" disabled={pending} className="mt-1 h-10 w-full sm:h-12">
          {pending ? "Un momento…" : mode === "sign-in" ? "Ingresar" : "Crear cuenta"}
        </Button>
      </form>

      {error ? <p className="mt-3 text-[13px] text-lm-danger">{error}</p> : null}
      {signedUp ? (
        <p className="mt-3 text-[13px] text-lm-success">Cuenta creada. Confirmá el mail que te llegó para poder ingresar.</p>
      ) : null}

      <button
        type="button"
        onClick={() => {
          onModeChange(mode === "sign-in" ? "sign-up" : "sign-in");
          setError(null);
          setSignedUp(false);
        }}
        className="mt-4 text-[13px] text-lm-ink-2 underline-offset-4 hover:text-lm-ink hover:underline"
      >
        {mode === "sign-in" ? "¿No tenés cuenta? Crear cuenta" : "¿Ya tenés cuenta? Ingresar"}
      </button>
    </div>
  );
}
