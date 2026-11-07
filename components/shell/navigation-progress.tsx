"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { finishNavigation, startNavigation, usePendingPath } from "@/components/shell/navigation-state";

/** Si la navegación nunca termina (ruta que falla, descarga), la barra no se queda colgada. */
const GIVE_UP_MS = 10_000;
const DONE_FLASH_MS = 400;

/** Rutas que no son pantallas de la app: no se navega con el router, así que no hay nada que esperar. */
function isAppPath(pathname: string) {
  return !pathname.startsWith("/api/") && !pathname.startsWith("/auth/");
}

/**
 * Barra fina arriba de todo mientras una navegación está en curso. Detecta el
 * clic en cualquier link interno (sidebar, hub, tablas, links dentro de una
 * página), así no hay que cablear cada uno. Termina cuando cambia el pathname.
 * Un solo trazo de `signal`, plano: el sistema no admite brillo ni degradé.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const pending = usePendingPath();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [lastPending, setLastPending] = useState(pending);

  // Se ajusta durante el render (no en un efecto) para no pagar un render de más.
  if (pending !== lastPending) {
    setLastPending(pending);
    setPhase(pending ? "loading" : "done");
  }

  useEffect(() => {
    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a");
      if (!anchor || !anchor.href) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      // Mismo pathname = filtro o ancla dentro de la misma pantalla, no es navegar.
      if (url.pathname === window.location.pathname || !isAppPath(url.pathname)) return;

      startNavigation(url.pathname);
    }

    // Captura: corre antes que el onClick de <Link>, que hace preventDefault.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    finishNavigation();
  }, [pathname]);

  useEffect(() => {
    if (!pending) return;
    const timer = window.setTimeout(finishNavigation, GIVE_UP_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = window.setTimeout(() => setPhase("idle"), DONE_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [phase]);

  return <div className="lm-progress" data-state={phase} aria-hidden />;
}
