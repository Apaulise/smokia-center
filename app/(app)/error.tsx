"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { describeError, ErrorScreen } from "@/components/ui/error-screen";

/**
 * Error dentro de un gestor: la barra lateral sigue en pie y sólo el escenario
 * muestra el error, así se puede ir a otra pantalla sin recargar.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const { code, detail } = describeError(error);

  return (
    <ErrorScreen
      kind="error"
      title="Esta pantalla no se pudo cargar"
      description="Puede ser un corte de conexión o algo que falló del lado del servidor. Probá de nuevo; si sigue igual, pasá el código de abajo a quien mantiene la app."
      code={code}
      detail={detail}
      actions={
        <>
          <Button variant="primary" onClick={() => retry()}>
            <RotateCcw className="size-3.5" strokeWidth={1.5} />
            Reintentar
          </Button>
          <ButtonLink href="/">Volver al inicio</ButtonLink>
        </>
      }
    />
  );
}
