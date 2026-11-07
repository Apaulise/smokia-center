"use client";

import { ViewTransition, type ReactNode } from "react";

/**
 * Envoltorio de una pantalla: al navegar, la anterior se desvanece rápido y la
 * nueva entra con un fundido corto y 8px de subida (CSS en globals.css:
 * `.lm-page-in` / `.lm-page-out`). La sidebar queda fuera, así que no se mueve.
 *
 * Va en `template.tsx` y no en el layout: un layout persiste entre rutas y
 * nunca dispara "entrar"; un template se remonta en cada cambio de ruta. Eso
 * evita además remontar lo que vive en los layouts (BrandAutoSync, OpsLiveRefresh).
 * Sin soporte del navegador, o con movimiento reducido, la pantalla cambia sin animación.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="lm-page-in" exit="lm-page-out" default="none">
      {children}
    </ViewTransition>
  );
}
