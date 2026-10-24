import type { ReactNode } from "react";

import { HeaderBar } from "@/components/leads/ui/page-header";

export function OpsFrame({ crumb, updatedAt, children }: { crumb: string; updatedAt: string; children: ReactNode }) {
  return (
    <>
      <HeaderBar
        breadcrumb={
          <>
            <span className="text-lm-ink-3">Gestor de Operaciones / </span>
            <span className="text-lm-ink">{crumb}</span>
          </>
        }
        meta={`Actualizado ${updatedAt}`}
      />
      <div className="flex flex-col gap-9 px-6 py-7 lg:px-8">{children}</div>
    </>
  );
}
