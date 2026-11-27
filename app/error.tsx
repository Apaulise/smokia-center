"use client";

import { RotateCcw } from "lucide-react";
import { useEffect } from "react";

import { Button, ButtonLink } from "@/components/ui/button";
import { describeError, ErrorScreen } from "@/components/ui/error-screen";

/** Error fuera de los gestores: la pantalla de inicio, el login o recuperar la contraseña. */
export default function RootError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const { code, detail } = describeError(error);

  return (
    <ErrorScreen
      frame="page"
      kind="error"
      title="Algo falló al cargar ALTAB"
      description="Probá de nuevo en unos segundos. Si sigue igual, pasá el código de abajo a quien mantiene la app."
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
