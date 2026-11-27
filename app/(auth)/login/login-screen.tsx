"use client";

import { useState, type ReactNode } from "react";

import { EmailSignInForm } from "@/app/(auth)/login/email-form";
import { GoogleSignInButton } from "@/app/(auth)/login/google-button";
import { BrandLockup } from "@/components/shell/brand-lockup";

type Mode = "sign-in" | "sign-up";

const COPY: Record<Mode, { title: string; description: string }> = {
  "sign-in": {
    title: "Ingresá a tu cuenta",
    description: "Usá tu cuenta de Google o tu email para continuar.",
  },
  "sign-up": {
    title: "Creá tu cuenta",
    description: "Completá tus datos para empezar.",
  },
};

const ERRORS = {
  failed: "No pudimos completar el ingreso. Probá de nuevo.",
  not_allowed: "Esta cuenta no tiene acceso a ALTAB.",
} as const;

export function LoginScreen({ next, error }: { next: string; error: keyof typeof ERRORS | null }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const copy = COPY[mode];

  return (
    <AuthShell title={copy.title} description={copy.description}>
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
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh gap-3 p-3 font-lm-sans text-lm-ink lg:grid-cols-2">
      {/* "Vidrio": los dos paneles flotan sobre el mismo fondo que el resto de la app. */}
      <div className="lm-ambient" aria-hidden />
      <div className="lm-stage flex flex-col justify-between rounded-lm-2xl px-6 py-8 sm:px-12 sm:py-10">
        <BrandLockup className="self-start" />

        <div className="mx-auto w-full max-w-[350px] py-12">
          <h1 className="font-lm-sans text-[28px] leading-[1.18] font-medium tracking-[-0.035em] text-lm-ink">{title}</h1>
          <p className="mt-2 text-[13.5px] text-lm-ink-2">{description}</p>

          <div className="mt-8">{children}</div>
        </div>

        <p className="font-mono text-[11px] text-lm-ink-3">© 2026 ALTAB</p>
      </div>

      <div
        aria-hidden="true"
        className="lm-glass-soft relative hidden items-center justify-center overflow-hidden rounded-lm-2xl border lg:flex"
        style={{ backgroundImage: "radial-gradient(ellipse at center, var(--color-lm-signal-soft), transparent 70%)" }}
      >
        <BrandLockup large />
      </div>
    </div>
  );
}
