import { Lock } from "lucide-react";

import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/shell/page-header";

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
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="px-6 lg:px-10">
        <EmptyState
          icon={<Lock className="size-5" />}
          title={`${phase} — todavía no construido`}
          description="Primero tiene que quedar terminado y en uso el Gestor de Leads. Un gestor por vez."
          action={
            <ButtonLink href="/leads" variant="primary">
              Ir al Gestor de Leads
            </ButtonLink>
          }
        />
      </div>
    </>
  );
}
