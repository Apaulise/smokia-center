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
 * cerrar el foco vuelve a donde estaba. Si hay dos abiertos, todo eso lo hace
 * sólo el de arriba.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  sheet = false,
  overlayClassName,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  sheet?: boolean;
  overlayClassName?: string;
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
      // Con dos diálogos abiertos (una confirmación arriba de un formulario) sólo responde el de arriba.
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== panel.current) return;
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
    if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus({ preventScroll: true });
    return () => previous?.focus({ preventScroll: true });
  }, [open, mounted]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className={cn("fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4", sheet ? "p-0" : "p-2", overlayClassName)}>
      <div className="absolute inset-0 bg-lm-scrim backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "lm-touch-controls lm-shadow-pop relative flex max-h-[calc(100dvh-1rem)] w-full max-w-lg flex-col overflow-hidden rounded-lm-xl border border-lm-line-strong font-lm-sans focus:outline-none sm:max-h-[90dvh]",
          sheet ? "lm-sheet-in max-sm:rounded-b-none bg-lm-surface" : "lm-rise lm-glass-pop",
          className,
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-lm-line px-5 py-4">
          <div className="min-w-0">
            <h3 id={titleId} className="text-[15px] font-semibold text-balance text-lm-ink">
              {title}
            </h3>
            {description ? <p className="mt-1 text-[13px] text-lm-ink-2">{description}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid size-11 shrink-0 place-items-center rounded-full text-lm-ink-3 active:bg-lm-ink/10 hover:bg-lm-ink/10 hover:text-lm-ink focus-visible:lm-focus sm:size-8"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className={cn("min-h-0 overflow-y-auto overscroll-contain", sheet ? "pb-[env(safe-area-inset-bottom,0px)]" : "p-4 pb-[max(1rem,env(safe-area-inset-bottom,0px))] sm:p-5")}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
