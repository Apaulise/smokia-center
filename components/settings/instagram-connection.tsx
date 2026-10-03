"use client";

import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Input } from "@/components/leads/ui/field";
import {
  deleteInstagramCredentials,
  saveInstagramCredentials,
  testInstagramConnection,
  type ActionState,
} from "@/lib/settings/actions";
import { cn } from "@/lib/utils";

/**
 * La conexión con Instagram de ESTE usuario: token de larga duración + id de la
 * cuenta profesional, guardados cifrados en `settings`. Mismo esquema que
 * `ApiKeyForm` (guardar / probar / eliminar), con dos campos en vez de uno.
 */
export function InstagramConnection({ configured, masked }: { configured: boolean; masked: string | null }) {
  const [saveState, saveAction, savePending] = useActionState(saveInstagramCredentials, null);
  const [testState, testAction, testPending] = useActionState(testInstagramConnection, null);
  const [deletePending, startDelete] = useTransition();
  const [saveDismissed, setSaveDismissed] = useState(false);
  const [testDismissed, setTestDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (saveState?.ok) formRef.current?.reset();
  }, [saveState]);

  return (
    <div className="flex flex-col gap-4">
      {configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-4 py-3">
          <div className="flex items-center gap-2 text-[13px]">
            <KeyRound className="size-4 text-lm-signal-text" strokeWidth={1.5} />
            <span className="font-mono text-lm-ink">{masked}</span>
          </div>
          <div className="flex items-center gap-2">
            <form action={testAction} onSubmit={() => setTestDismissed(false)}>
              <Button type="submit" variant="secondary" size="sm" disabled={testPending}>
                {testPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Probar conexión
              </Button>
            </form>
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={deletePending}
              onClick={() => {
                if (!window.confirm("¿Desconectar tu Instagram? Se dejan de sincronizar métricas y no se puede publicar hasta volver a conectarlo.")) return;
                setSaveDismissed(true);
                setTestDismissed(true);
                startDelete(() => {
                  void deleteInstagramCredentials();
                });
              }}
            >
              Desconectar
            </Button>
          </div>
        </div>
      ) : null}

      <StatusLine state={testDismissed ? null : testState} />

      <form
        ref={formRef}
        action={saveAction}
        onSubmit={() => setSaveDismissed(false)}
        className="flex flex-wrap items-end gap-3"
      >
        <Field label={configured ? "Reemplazar token" : "Token de acceso"} htmlFor="accessToken" className="min-w-[260px] flex-[2]">
          <Input id="accessToken" name="accessToken" type="password" autoComplete="off" placeholder="IGAA… o EAA…" required />
        </Field>
        <Field label="Id de la cuenta de Instagram" htmlFor="userId" className="min-w-[180px] flex-1">
          <Input id="userId" name="userId" inputMode="numeric" autoComplete="off" placeholder="1784…" mono required />
        </Field>
        <Button type="submit" variant="primary" disabled={savePending}>
          {savePending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {configured ? "Reemplazar" : "Conectar"}
        </Button>
      </form>

      <StatusLine state={saveDismissed ? null : saveState} />

      <p className="text-xs text-lm-ink-3">
        Cada usuario conecta su propia cuenta. El token de larga duración vence a los 60 días: si la conexión falla con
        “venció o fue revocado”, generá uno nuevo y reemplazalo acá.
      </p>
    </div>
  );
}

function StatusLine({ state }: { state: ActionState }) {
  if (!state) return null;
  return (
    <p className={cn("flex items-center gap-1.5 text-[13px]", state.ok ? "text-lm-success" : "text-lm-danger")}>
      {state.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
      {state.message}
    </p>
  );
}
