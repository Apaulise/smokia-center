"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";

import { THEME_STORAGE_KEY } from "@/components/shell/theme-toggle";
import { Button } from "@/components/ui/button";
import { describeError, ErrorScreen } from "@/components/ui/error-screen";

import "./globals.css";

/**
 * Último recurso: falló el layout raíz, así que esta pantalla reemplaza el
 * documento entero (trae su propio `<html>` y `<body>`, y no hereda fuentes ni
 * el tema). El tema se lee de lo que guardó el interruptor; la tipografía cae
 * en la del sistema, que es la de respaldo de la app.
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    console.error(error);
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (localStorage.getItem(THEME_STORAGE_KEY) === "light") setTheme("light");
    } catch {
      // Sin storage queda el oscuro, que es el default.
    }
  }, [error]);

  const { code, detail } = describeError(error);

  return (
    <html lang="es" data-theme={theme} suppressHydrationWarning>
      <body className="min-h-full">
        <title>Error · SmokIA</title>
        <ErrorScreen
          frame="page"
          kind="error"
          title="SmokIA no pudo arrancar"
          description="Falló algo antes de que se pudiera dibujar la app. Recargá la página; si sigue igual, pasá el código de abajo a quien mantiene la app."
          code={code}
          detail={detail}
          actions={
            <>
              <Button variant="primary" onClick={() => retry()}>
                <RotateCcw className="size-3.5" strokeWidth={1.5} />
                Reintentar
              </Button>
              {/* Un `<a>` común y no un Link: si el router se rompió, una navegación completa igual funciona. */}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
              <a
                href="/"
                className="inline-flex h-8 items-center rounded-lm-sm border border-lm-line-strong bg-lm-ink/5 px-3 font-lm-sans text-[13px] font-medium text-lm-ink hover:bg-lm-ink/10 focus-visible:lm-focus"
              >
                Volver al inicio
              </a>
            </>
          }
        />
      </body>
    </html>
  );
}
