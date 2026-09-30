"use client";

import { CheckCircle2, KeyRound, Loader2, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Input } from "@/components/leads/ui/field";
import type { ActionState } from "@/lib/settings/actions";
import { cn } from "@/lib/utils";

type KeyServerAction = (prevState: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Base compartida por las cards de API key de /configuracion (Apify, Groq,
 * Gemini, Anthropic): guardar, probar conexión y eliminar sobre la tabla `settings`.
 *
 * `saveState`/`testState` viven en su propio useActionState y no se enteran
 * de un `deleteAction` (es una mutación aparte) — por eso el mensaje de éxito
 * de una key ya borrada podía quedar pegado en pantalla. `dismissed` lo tapa
 * al eliminar, y cada form lo destapa sólo para sí mismo al reenviarse.
 */
export function ApiKeyForm({
  configured,
  masked,
  label,
  placeholder,
  confirmDeleteMessage,
  saveAction: saveServerAction,
  testAction: testServerAction,
  deleteAction,
}: {
  configured: boolean;
  masked: string | null;
  label: string;
  placeholder: string;
  confirmDeleteMessage: string;
  saveAction: KeyServerAction;
  testAction: KeyServerAction;
  deleteAction: () => Promise<void>;
}) {
  const [saveState, saveAction, savePending] = useActionState(saveServerAction, null);
  const [testState, testAction, testPending] = useActionState(testServerAction, null);
  const [deletePending, startDelete] = useTransition();
  const [saveDismissed, setSaveDismissed] = useState(false);
  const [testDismissed, setTestDismissed] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (saveState?.ok) formRef.current?.reset();
  }, [saveState]);

  const showTestState = testState && !testDismissed;
  const showSaveState = saveState && !saveDismissed;

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
                if (!window.confirm(confirmDeleteMessage)) return;
                setSaveDismissed(true);
                setTestDismissed(true);
                startDelete(() => {
                  void deleteAction();
                });
              }}
            >
              Eliminar
            </Button>
          </div>
        </div>
      ) : null}

      {showTestState ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-[13px]",
            testState.ok ? "text-lm-success" : "text-lm-danger",
          )}
        >
          {testState.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
          {testState.message}
        </p>
      ) : null}

      <form
        ref={formRef}
        action={saveAction}
        onSubmit={() => setSaveDismissed(false)}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="min-w-[260px] flex-1">
          <label htmlFor="apiKey" className="mb-1.5 block font-lm-sans text-[13px] font-medium text-lm-ink-2">
            {configured ? "Reemplazar API key" : label}
          </label>
          <Input id="apiKey" name="apiKey" type="password" autoComplete="off" placeholder={placeholder} required />
        </div>
        <Button type="submit" variant="primary" disabled={savePending}>
          {savePending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar
        </Button>
      </form>

      {showSaveState ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-[13px]",
            saveState.ok ? "text-lm-success" : "text-lm-danger",
          )}
        >
          {saveState.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
          {saveState.message}
        </p>
      ) : null}
    </div>
  );
}
