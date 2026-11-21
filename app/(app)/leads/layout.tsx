import type { ReactNode } from "react";

// El copiloto de prospección (§1.10 en adelante) llama a Gemini y a Claude
// desde Server Actions de cualquier pantalla de /leads: enriquecer, generar
// apertura, analizar una respuesta, reescribir tono. El default de Vercel
// corta antes de que esas llamadas terminen — mismo criterio que
// app/(app)/marca/layout.tsx.
export const maxDuration = 60;

/**
 * Envoltorio de las pantallas de Leads: tipografía y color de texto del
 * sistema, y el alto mínimo del escenario (`lm-page-min`, globals.css).
 */
export default function LeadsLayout({ children }: { children: ReactNode }) {
  return <div className="lm-page-min font-lm-sans text-lm-ink">{children}</div>;
}
