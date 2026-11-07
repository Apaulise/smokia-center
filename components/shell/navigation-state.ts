import { useSyncExternalStore } from "react";

/*
 * Estado de "estoy navegando a…" compartido entre la barra de progreso y la
 * sidebar. `usePathname()` recién cambia cuando la ruta nueva termina de
 * renderizar, así que sin esto el ítem activo del menú reacciona con retraso
 * (el clic parece no hacer nada). Con esto el menú responde en el mismo
 * fotograma del clic y la ruta se confirma después.
 */
let pendingPath: string | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function startNavigation(path: string) {
  if (pendingPath === path) return;
  pendingPath = path;
  emit();
}

export function finishNavigation() {
  if (pendingPath === null) return;
  pendingPath = null;
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Ruta a la que se está navegando, o `null` si no hay navegación en curso. */
export function usePendingPath() {
  return useSyncExternalStore(
    subscribe,
    () => pendingPath,
    () => null,
  );
}
