import { ButtonLink } from "@/components/ui/button";
import { ErrorScreen } from "@/components/ui/error-screen";

export const metadata = { title: "Página no encontrada · SmokIA" };

/** Una dirección que no existe. Va sin barra lateral: no se está dentro de ningún gestor. */
export default function NotFound() {
  return (
    <ErrorScreen
      frame="page"
      kind="not-found"
      title="Esta página no existe"
      description="Revisá la dirección, o volvé al inicio y entrá desde el gestor."
      actions={
        <ButtonLink href="/" variant="primary">
          Volver al inicio
        </ButtonLink>
      }
    />
  );
}
