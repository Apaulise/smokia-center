"use client";

import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";

import { deleteApifyKey, saveApifyKey, testApifyConnection } from "@/lib/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ApifyKeyForm({
  configured,
  masked,
}: {
  configured: boolean;
  masked: string | null;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveApifyKey, null);
  const [testState, testAction, testPending] = useActionState(testApifyConnection, null);
  const [deletePending, startDelete] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (saveState?.ok) formRef.current?.reset();
  }, [saveState]);

  return (
    <div className="space-y-4">
      {configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-surface/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm">
            <KeyRound className="size-4 text-cyan" />
            <span className="tabular text-ink">{masked}</span>
          </div>
          <div className="flex items-center gap-2">
            <form action={testAction}>
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
                if (!window.confirm("¿Eliminar la API key de Apify guardada?")) return;
                startDelete(() => {
                  void deleteApifyKey();
                });
              }}
            >
              Eliminar
            </Button>
          </div>
        </div>
      ) : null}

      {testState ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            testState.ok ? "text-positive" : "text-danger",
          )}
        >
          {testState.ok ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
          {testState.message}
        </p>
      ) : null}

      <form ref={formRef} action={saveAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[260px] flex-1">
          <label htmlFor="apiKey" className="mb-1.5 block text-xs text-muted">
            {configured ? "Reemplazar API key" : "API key de Apify"}
          </label>
          <Input
            id="apiKey"
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder="apify_api_••••••••••••••••"
            required
          />
        </div>
        <Button type="submit" variant="primary" disabled={savePending}>
          {savePending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar
        </Button>
      </form>

      {saveState ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            saveState.ok ? "text-positive" : "text-danger",
          )}
        >
          {saveState.ok ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <XCircle className="size-4" />
          )}
          {saveState.message}
        </p>
      ) : null}
    </div>
  );
}
