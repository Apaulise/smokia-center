"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Modal simple, controlado por el padre (sin librería aparte: el manual no
 * pide nada más que un panel centrado con foco contenido).
 *
 * Se porta a `document.body`: un `Card` ancestro trae `backdrop-blur-sm`, y
 * `backdrop-filter` en un ancestro crea un containing block nuevo para los
 * descendientes `position: fixed` — sin el portal, el modal queda encerrado
 * en el rectángulo del Card en vez de cubrir la pantalla, y dos abiertos a la
 * vez terminan superpuestos de forma rara.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Portal recién disponible tras hidratar: sin esto, createPortal(..., document.body)
    // revienta en SSR (document no existe) y el mismatch server/cliente rompe la hidratación.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-base/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-[20px] border border-line bg-elevated shadow-2xl",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-line/60 px-6 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-base">{title}</h3>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-[12px] p-1.5 text-muted hover:bg-surface/60 hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        {/* Todo el contenido (campos, paneles de confirmación y botones) comparte este único scroll:
            si cada uno tuviera el suyo, el de más abajo puede quedar atrapado fuera de la pantalla. */}
        <div className="overflow-y-auto p-6">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
