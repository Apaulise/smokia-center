import { ViewTransition } from "react";

/**
 * Esqueleto genérico mientras llega una pantalla sin `loading.tsx` propio.
 * Al llegar el contenido, el esqueleto se desvanece (`.lm-page-out`) en vez de
 * desaparecer de golpe. El movimiento es el humo de `lm-smoke`.
 */
export default function AppLoading() {
  return (
    <ViewTransition exit="lm-page-out" default="none">
      <div className="px-6 py-8 lg:px-8" role="status" aria-label="Cargando sección">
        <div className="lm-smoke w-48" />
        <div className="lm-smoke mt-8 !h-8 w-72 max-w-full" />
        <div className="lm-smoke mt-3 w-96 max-w-full" />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-32 rounded-lm-lg border border-lm-line bg-lm-surface/50" />
          ))}
        </div>
      </div>
    </ViewTransition>
  );
}
