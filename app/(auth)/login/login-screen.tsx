"use client";

import { useState, type ReactNode } from "react";

import { EmailSignInForm } from "@/app/(auth)/login/email-form";
import { GoogleSignInButton } from "@/app/(auth)/login/google-button";

type Mode = "sign-in" | "sign-up";

const COPY: Record<Mode, { title: string; description: string; quote: string }> = {
  "sign-in": {
    title: "Ingresá a tu cuenta",
    description: "Usá tu cuenta de Google o tu email para continuar.",
    quote: "Cada conversación, un paso más cerca del cierre.",
  },
  "sign-up": {
    title: "Creá tu cuenta",
    description: "Completá tus datos para empezar.",
    quote: "Tu próxima lista de clientes empieza acá.",
  },
};

const ERRORS = {
  failed: "No pudimos completar el ingreso. Probá de nuevo.",
  not_allowed: "Esta cuenta no tiene acceso a SmokIA.",
} as const;

/**
 * Pantalla de login (Design System §08): split 2 columnas — formulario a la
 * izquierda, panel de marca con cita a la derecha. `mode` vive acá (no
 * adentro de `EmailSignInForm`) para que la cita cambie con sign-in/sign-up,
 * como pide el mockup.
 */
export function LoginScreen({ next, error }: { next: string; error: keyof typeof ERRORS | null }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const copy = COPY[mode];

  return (
    <AuthShell title={copy.title} description={copy.description} quote={copy.quote}>
      <div className="flex flex-col gap-4">
        <EmailSignInForm next={next} mode={mode} onModeChange={setMode} />
        <div className="flex items-center gap-3 text-xs text-lm-ink-3">
          <span className="h-px flex-1 bg-lm-line" />
          o continuá con
          <span className="h-px flex-1 bg-lm-line" />
        </div>
        <GoogleSignInButton next={next} />
      </div>

      {error ? <p className="mt-4 text-[13px] text-lm-danger">{ERRORS[error]}</p> : null}
    </AuthShell>
  );
}

/** El layout compartido por login y recuperar contraseña: formulario + panel de marca. */
export function AuthShell({
  title,
  description,
  quote,
  children,
}: {
  title: string;
  description: string;
  quote: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh bg-lm-bg font-lm-sans text-lm-ink lg:grid-cols-2">
      <div className="flex flex-col justify-between px-6 py-8 sm:px-12 sm:py-10">
        <span className="font-lm-sans text-sm font-semibold text-lm-ink">
          Smok<span className="text-lm-ink-2">IA</span>
        </span>

        <div className="mx-auto w-full max-w-[350px] py-12">
          <h1 className="font-lm-sans text-[26px] leading-8 font-semibold tracking-[-0.01em] text-lm-ink">{title}</h1>
          <p className="mt-2 text-[13.5px] text-lm-ink-2">{description}</p>

          <div className="mt-8">{children}</div>
        </div>

        <p className="font-mono text-[11px] text-lm-ink-3">© 2026 SmokIA</p>
      </div>

      <div
        className="relative hidden items-center justify-center overflow-hidden bg-lm-surface lg:flex"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgb(237 235 230 / 0.035) 1px, transparent 1px), linear-gradient(to bottom, rgb(237 235 230 / 0.035) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      >
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-lm-surface to-transparent" />
        <div className="relative flex flex-col items-center gap-10 px-12 text-center">
          <span className="font-lm-sans text-[40px] leading-none font-semibold tracking-[-0.02em] text-lm-ink">
            Smok<span className="text-lm-ink-2">IA</span>
          </span>
          <p className="max-w-xs text-[22px] leading-8 text-lm-ink-2">
            “{quote}”
            <span className="ml-0.5 inline-block h-[22px] w-[2px] translate-y-1 bg-lm-signal motion-safe:animate-pulse" aria-hidden />
          </p>
        </div>
      </div>
    </div>
  );
}
