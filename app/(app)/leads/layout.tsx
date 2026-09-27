import type { ReactNode } from "react";

// El copiloto de prospección (§1.10 en adelante) llama a Gemini y a Claude
// desde Server Actions de cualquier pantalla de /leads: enriquecer, generar
// apertura, analizar una respuesta, reescribir tono. El default de Vercel
// corta antes de que esas llamadas terminen — mismo criterio que
// app/(app)/marca/layout.tsx.
export const maxDuration = 60;

/**
 * Envoltorio visual del sistema "Señal y humo": fondo opaco, texto y
 * tipografía propios, para que el degradado del body (Marca) no se filtre
 * detrás de las pantallas de Leads.
 */
export default function LeadsLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-lm-bg font-lm-sans text-lm-ink">{children}</div>;
}
