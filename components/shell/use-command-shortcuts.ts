"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { SHORTCUT_ROUTES } from "@/components/shell/commands";
import { startNavigation } from "@/components/shell/navigation-state";

/** Cuánto se espera la segunda tecla de un atajo («G», después «D»). */
const SEQUENCE_MS = 1200;
const PREFIXES = new Set([...SHORTCUT_ROUTES.keys()].map((sequence) => sequence.split(" ")[0]));

/**
 * Atajos de dos teclas de toda la app (`G D` = Dashboard, `N T` = nuevo
 * turno…, ver commands.ts). No se disparan mientras se escribe en un campo, con
 * un diálogo abierto o con una tecla modificadora apretada, así que no pisan
 * los atajos propios de una pantalla (J/K/E/R de Chats, ←/→ de la ficha).
 */
export function useCommandShortcuts(enabled: boolean) {
  const router = useRouter();

  useEffect(() => {
    if (!enabled) return;
    let prefix: string | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    function reset() {
      prefix = null;
      if (timer) clearTimeout(timer);
      timer = null;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return reset();
      if (document.querySelector('[role="dialog"]')) return reset();

      const key = event.key.toLowerCase();
      if (prefix) {
        const href = SHORTCUT_ROUTES.get(`${prefix} ${key}`);
        reset();
        if (!href) return;
        event.preventDefault();
        startNavigation(href.split(/[?#]/)[0]);
        router.push(href);
        return;
      }
      if (PREFIXES.has(key)) {
        prefix = key;
        timer = setTimeout(reset, SEQUENCE_MS);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      reset();
    };
  }, [enabled, router]);
}
