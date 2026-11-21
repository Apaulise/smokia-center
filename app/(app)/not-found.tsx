import { ButtonLink } from "@/components/ui/button";
import { ErrorScreen } from "@/components/ui/error-screen";

export const metadata = { title: "No encontrado · SmokIA" };

/** Un lead, una lista o un reel que no existe (o que no es tuyo): `notFound()` dentro de un gestor. */
export default function AppNotFound() {
  return (
    <ErrorScreen
      kind="not-found"
      title="No encontramos lo que buscás"
      description="Puede que se haya borrado, que el enlace esté viejo o que sea de otra cuenta."
      actions={
        <>
          <ButtonLink href="/leads" variant="primary">
            Ir al Gestor de Leads
          </ButtonLink>
          <ButtonLink href="/">Todos los gestores</ButtonLink>
        </>
      }
    />
  );
}
