import type { ReactNode } from "react";

import { BrandAutoSync } from "@/components/brand/auto-sync";

const PLATFORM = "INSTAGRAM" as const;

// BrandAutoSync dispara syncBrandNow (varias llamadas a Windsor) como Server
// Action desde cualquier pantalla de /marca, no sólo desde las que ya tenían
// su propio maxDuration=60 (dashboard, chat, análisis, competencia, planificador).
// Sin esto, en /marca/contenido o /marca/conocimiento el auto-sync correría con
// el timeout por default y podría cortarse a mitad de corrida.
export const maxDuration = 60;

export default function MarcaLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BrandAutoSync platform={PLATFORM} />
      {children}
    </>
  );
}
