import { ArrowRight } from "lucide-react";

import { ListActionsMenu } from "@/components/leads/list-actions-menu";
import { ButtonLink } from "@/components/leads/ui/button";
import { StatusBadge, Chip } from "@/components/leads/ui/status-badge";
import { CSV_PROVIDER_META, getProvider } from "@/lib/providers/registry";
import type { LeadListOverviewRow } from "@/lib/leads/queries";

const JOB_STATUS_LABEL: Record<LeadListOverviewRow["status"], string> = {
  PENDIENTE: "Pendiente",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  FALLIDO: "Fallido",
};

const JOB_STATUS_GROUP: Record<LeadListOverviewRow["status"], "frio" | "curso" | "ganado" | "salida"> = {
  PENDIENTE: "frio",
  EN_CURSO: "curso",
  COMPLETADO: "ganado",
  FALLIDO: "salida",
};

export function sourceLabel(source: LeadListOverviewRow["source"]) {
  if (source === "CSV" || source === "MANUAL") return CSV_PROVIDER_META.label;
  return getProvider(source)?.label ?? source;
}

/** Una lista en la vista grilla de /leads/lista: elegir, renombrar o borrar sin entrar a sus leads. */
export function LeadListCard({ list }: { list: LeadListOverviewRow }) {
  const leadCount = list.leads[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-3 rounded-lm-lg border border-lm-line-strong bg-lm-surface p-4 outline-1 -outline-offset-1 outline-transparent transition-colors hover:bg-[#1c1c1f] hover:outline-lm-line-strong">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate font-lm-sans text-[15px] font-semibold text-lm-ink">{list.name}</h3>
          <p className="mt-0.5 font-mono text-xs text-lm-ink-3">
            {new Date(list.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short", year: "numeric" })}
          </p>
        </div>
        <StatusBadge group={JOB_STATUS_GROUP[list.status]}>{JOB_STATUS_LABEL[list.status]}</StatusBadge>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip>{sourceLabel(list.source)}</Chip>
        {list.industries ? <Chip color={list.industries.color}>{list.industries.name}</Chip> : null}
      </div>

      <p className="font-mono text-[13px] tabular-nums text-lm-ink-2">
        {leadCount} {leadCount === 1 ? "lead" : "leads"}
      </p>

      <div className="flex items-center justify-between gap-2 border-t border-lm-line pt-3">
        <ButtonLink href={`/leads/lista/${list.id}`} variant="secondary" size="sm">
          Ver leads
          <ArrowRight className="size-3.5" strokeWidth={1.5} />
        </ButtonLink>
        <ListActionsMenu listId={list.id} listName={list.name} leadCount={leadCount} variant="standalone" />
      </div>
    </div>
  );
}
