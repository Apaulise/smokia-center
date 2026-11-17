"use client";

import { useCallback, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

export type ConfirmOptions = {
  /** La pregunta, corta: «¿Borrar este turno?». */
  title: string;
  /** Qué pasa si se confirma, sobre todo lo que no se puede deshacer. */
  description?: ReactNode;
  /** El verbo de lo que se va a hacer: «Borrar», «Desconectar». */
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` cuando se borra o se pierde algo. */
  tone?: "danger" | "default";
};

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };

/**
 * La confirmación de la app, en vez de `window.confirm` (que es una ventana
 * del navegador, fuera del estilo, y que algunos navegadores bloquean):
 *
 *   const { confirm, confirmDialog } = useConfirm();
 *   if (!(await confirm({ title: "¿Borrar este turno?", tone: "danger" }))) return;
 *   …
 *   return <>{…}{confirmDialog}</>;
 *
 * El foco arranca en «Cancelar»: un Enter apurado no borra nada. Esc, la X o un
 * clic afuera cuentan como cancelar.
 */
export function useConfirm() {
  const [pending, setPending] = useState<Pending | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ ...options, resolve })), []);

  function settle(ok: boolean) {
    pending?.resolve(ok);
    setPending(null);
  }

  const danger = pending?.tone === "danger";
  const confirmDialog = (
    <Dialog open={pending !== null} onClose={() => settle(false)} title={pending?.title ?? ""} className="max-w-md">
      <div className="flex flex-col gap-5">
        {pending?.description ? <div className="text-[13.5px] leading-[1.55] text-lm-ink-2">{pending.description}</div> : null}
        <div className="flex justify-end gap-2">
          <Button autoFocus onClick={() => settle(false)}>
            {pending?.cancelLabel ?? "Cancelar"}
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            className={danger ? "border-lm-danger/30 bg-lm-danger-soft hover:bg-lm-danger/20" : undefined}
            onClick={() => settle(true)}
          >
            {pending?.confirmLabel ?? "Confirmar"}
          </Button>
        </div>
      </div>
    </Dialog>
  );

  return { confirm, confirmDialog };
}
