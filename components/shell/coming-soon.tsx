import { Lock } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";

/**
 * Módulo todavía no construido. Se muestra en vez de esconderse, para que la
 * estructura del negocio se lea completa desde el día 1 (CLAUDE.md §2).
 */
export function ComingSoon({
  eyebrow,
  title,
  description,
  phase,
}: {
  eyebrow: string;
  title: string;
  description: string;
  phase: string;
}) {
  return (
    <>
      <HeaderBar breadcrumb={title} />
      <div className="flex flex-col gap-8 px-6 py-7 lg:px-8">
        <PageHeading eyebrow={eyebrow} title={title} description={description} />
        <EmptyState
          icon={<Lock className="size-5" strokeWidth={1.5} />}
          title={`${phase} — todavía no construido`}
          description="Primero tiene que quedar terminado y en uso el Gestor de Leads. Un gestor por vez."
          action={
            <ButtonLink href="/" variant="primary">
              Volver al inicio
            </ButtonLink>
          }
        />
      </div>
    </>
  );
}
