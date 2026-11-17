"use client";

import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal del sistema: velo `scrim`, panel de vidrio opaco con radio `xl` y la
 * sombra de flotantes (`lm-shadow-pop`). Se monta en `document.body` con un
 * portal: un ancestro con `transform` (las pantallas entran con `.lm-rise`)
 * haría de contenedor del `position: fixed` y el modal quedaría recortado.
 *
 * Teclado: al abrir, el foco entra al panel (o al campo con `autoFocus`), Tab
 * da la vuelta adentro en vez de irse a la página de atrás, Esc cierra y al
 * cerrar el foco vuelve a donde estaba.
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
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panel.current) return;
      // Tab da la vuelta dentro del diálogo.
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((item) => item.offsetParent !== null);
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panel.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  // El foco entra al abrir y vuelve a donde estaba al cerrar.
  useEffect(() => {
    if (!open || !mounted) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
    return () => previous?.focus();
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-lm-scrim backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "lm-shadow-pop lm-rise relative flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lm-xl border border-lm-line-strong lm-glass-pop font-lm-sans focus:outline-none",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-lm-line px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-[15px] font-semibold text-lm-ink">
              {title}
            </h3>
            {description ? <p className="mt-1 text-[13px] text-lm-ink-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 rounded-full p-1.5 text-lm-ink-3 hover:bg-lm-ink/10 hover:text-lm-ink focus-visible:lm-focus"
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
