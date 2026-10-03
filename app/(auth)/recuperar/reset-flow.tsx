"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { AuthShell } from "@/app/(auth)/login/login-screen";
import { Button } from "@/components/leads/ui/button";
import { Field, Input } from "@/components/leads/ui/field";
import { OTPInput } from "@/components/ui/otp-input";

import { requestPasswordReset, updatePassword, verifyResetCode } from "./actions";

type Step = "email" | "code" | "password";

const COPY: Record<Step, { title: string; description: string; quote: string }> = {
  email: {
    title: "Recuperá tu contraseña",
    description: "Te mandamos un código de 6 dígitos a tu mail.",
    quote: "Un código y volvés a estar adentro.",
  },
  code: {
    title: "Ingresá el código",
    description: "",
    quote: "Un código y volvés a estar adentro.",
  },
  password: {
    title: "Elegí una contraseña nueva",
    description: "Al guardarla entrás directo a la app.",
    quote: "Cada conversación, un paso más cerca del cierre.",
  },
};

/**
 * Reset de contraseña en tres pasos: mail → código (OTP) → contraseña nueva.
 * El paso 2 ya deja sesión iniciada (verifyOtp), por eso `/recuperar` es una
 * ruta pública que el proxy no redirige a /leads con sesión.
 */
export function ResetFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Cambiarla remonta el OTP y lo vacía (es no controlado).
  const [otpKey, setOtpKey] = useState(0);

  async function sendCode(target: string) {
    setPending(true);
    setError(null);
    setNotice(null);
    const result = await requestPasswordReset(target);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return false;
    }
    setNotice(result.message);
    return true;
  }

  async function onEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    if (await sendCode(target)) {
      setEmail(target);
      setStep("code");
    }
  }

  async function onCodeComplete(code: string) {
    setPending(true);
    setError(null);
    const result = await verifyResetCode(email, code);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setNotice(null);
    setStep("password");
  }

  async function onResend() {
    if (await sendCode(email)) setOtpKey((key) => key + 1);
  }

  async function onPasswordSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await updatePassword(String(formData.get("password") ?? ""), String(formData.get("confirm") ?? ""));
    if (!result.ok) {
      setError(result.message);
      setPending(false);
      return;
    }
    router.push("/leads");
    router.refresh();
  }

  const copy = COPY[step];
  const description = step === "code" ? `Lo mandamos a ${email}. Vence en una hora.` : copy.description;

  return (
    <AuthShell title={copy.title} description={description} quote={copy.quote}>
      {step === "email" ? (
        <form onSubmit={onEmailSubmit} className="flex flex-col gap-4">
          <Field label="Email" htmlFor="email">
            <Input id="email" name="email" type="email" autoComplete="email" required autoFocus className="h-10 sm:h-12" />
          </Field>
          <Button type="submit" variant="primary" disabled={pending} className="mt-1 h-10 w-full sm:h-12">
            {pending ? "Enviando…" : "Enviar código"}
          </Button>
        </form>
      ) : null}

      {step === "code" ? (
        <div className="flex flex-col gap-4">
          <OTPInput
            key={otpKey}
            length={6}
            autoFocus
            disabled={pending}
            error={error !== null}
            onValueChange={() => setError(null)}
            onComplete={onCodeComplete}
          />
          {pending ? <p className="text-[13px] text-lm-ink-2">Verificando…</p> : null}
          <p className="text-[13px] text-lm-ink-3">
            ¿No te llegó?{" "}
            <button
              type="button"
              onClick={onResend}
              disabled={pending}
              className="text-lm-ink-2 underline underline-offset-4 hover:text-lm-ink disabled:opacity-45"
            >
              Reenviar código
            </button>
          </p>
        </div>
      ) : null}

      {step === "password" ? (
        <form onSubmit={onPasswordSubmit} className="flex flex-col gap-4">
          <Field label="Contraseña nueva" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              required
              autoFocus
              className="h-10 sm:h-12"
            />
          </Field>
          <Field label="Repetila" htmlFor="confirm">
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={6} required className="h-10 sm:h-12" />
          </Field>
          <Button type="submit" variant="primary" disabled={pending} className="mt-1 h-10 w-full sm:h-12">
            {pending ? "Guardando…" : "Guardar y entrar"}
          </Button>
        </form>
      ) : null}

      {error ? <p className="mt-3 text-[13px] text-lm-danger">{error}</p> : null}
      {notice ? <p className="mt-3 text-[13px] text-lm-ink-2">{notice}</p> : null}

      {step !== "password" ? (
        <Link
          href="/login"
          className="mt-6 inline-block text-[13px] text-lm-ink-2 underline-offset-4 hover:text-lm-ink hover:underline"
        >
          Volver a ingresar
        </Link>
      ) : null}
    </AuthShell>
  );
}
