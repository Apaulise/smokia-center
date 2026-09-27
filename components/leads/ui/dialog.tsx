"use client";

import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

/**
 * Modal del sistema "Señal y humo": overlay `bg-lm-bg/66`, panel `surface`
 * con radio `lg`, sombra única del sistema (`lm-shadow-pop`). Ver
 * `@/components/ui/dialog` para el porqué del portal a `document.body`.
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
      <div className="absolute inset-0 bg-[rgb(19_19_21/0.66)]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "lm-shadow-pop relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-lm-lg border border-lm-line bg-lm-raised font-lm-sans",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-lm-line px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold text-lm-ink">{title}</h3>
            {description ? <p className="mt-1 text-[13px] text-lm-ink-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-lm-sm p-1.5 text-lm-ink-3 hover:bg-lm-overlay hover:text-lm-ink"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
