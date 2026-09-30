"use client";

import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/leads/ui/button";
import { testInstagramConnection } from "@/lib/settings/actions";
import { cn } from "@/lib/utils";

/**
 * Las credenciales de Instagram están en variables de entorno (no se cargan
 * desde la app), así que esta card no guarda nada: dice si están y prueba que
 * el token siga vigente.
 */
export function InstagramConnection({ configured }: { configured: boolean }) {
  const [testState, testAction, testPending] = useActionState(testInstagramConnection, null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-4 py-3">
        <div className="flex items-center gap-2 text-[13px]">
          <KeyRound className={cn("size-4", configured ? "text-lm-signal-text" : "text-lm-ink-3")} strokeWidth={1.5} />
          <span className="text-lm-ink">
            {configured
              ? "Credenciales cargadas en el entorno."
              : "Faltan INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_USER_ID en las variables de entorno."}
          </span>
        </div>
        {configured ? (
          <form action={testAction}>
            <Button type="submit" variant="secondary" size="sm" disabled={testPending}>
              {testPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Probar conexión
            </Button>
          </form>
        ) : null}
      </div>

      {testState ? (
        <p className={cn("flex items-center gap-1.5 text-[13px]", testState.ok ? "text-lm-success" : "text-lm-danger")}>
          {testState.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
          {testState.message}
        </p>
      ) : null}

      <p className="text-xs text-lm-ink-3">
        El token de larga duración vence a los 60 días: si la conexión falla con “venció o fue revocado”, generá uno
        nuevo y actualizá INSTAGRAM_ACCESS_TOKEN (local y en Vercel).
      </p>
    </div>
  );
}
