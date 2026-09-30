import type { ReactNode } from "react";

import { BrandAutoSync } from "@/components/brand/auto-sync";

const PLATFORM = "INSTAGRAM" as const;

// BrandAutoSync dispara syncBrandNow (varias llamadas a la API de Instagram) como Server
// Action desde cualquier pantalla de /marca, no sólo desde las que ya tenían
// su propio maxDuration=60 (dashboard, chat, análisis, competencia, planificador).
// Sin esto, en /marca/contenido o /marca/conocimiento el auto-sync correría con
// el timeout por default y podría cortarse a mitad de corrida.
export const maxDuration = 60;

/**
 * Envoltorio visual del sistema "Señal y humo": fondo opaco, texto y
 * tipografía propios, para que el degradado del body no se filtre detrás de
 * las pantallas de Marca (mismo criterio que app/(app)/leads/layout.tsx).
 */
export default function MarcaLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-lm-bg font-lm-sans text-lm-ink">
      <BrandAutoSync platform={PLATFORM} />
      {children}
    </div>
  );
}
