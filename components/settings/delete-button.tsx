"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/leads/ui/button";

/** Botón de borrado genérico: confirma en el cliente y llama a una server action ya bindeada a su id. */
export function DeleteButton({
  action,
  confirmText,
  label = "Eliminar",
}: {
  action: () => Promise<void>;
  confirmText: string;
  label?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={() => {
        if (!window.confirm(confirmText)) return;
        startTransition(() => {
          void action();
        });
      }}
      aria-label={label}
      title={label}
    >
      {pending ? (
        <Loader2 className="size-3.5 animate-spin" />
      ) : (
        <Trash2 className="size-3.5" strokeWidth={1.5} />
      )}
    </Button>
  );
}
