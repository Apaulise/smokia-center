import { UserRound, UsersRound } from "lucide-react";

import { Segmented, SegmentedLink } from "@/components/leads/ui/tabs";

export type AgendaScope = "mine" | "team";

export function AgendaScopeToggle({ scope, view, date, hasTeam, teamAvailable }: { scope: AgendaScope; view: string; date: string; hasTeam: boolean; teamAvailable: boolean }) {
  if (!hasTeam) return null;

  return (
    <Segmented>
      <SegmentedLink href={`/leads/agenda?view=${view}&date=${date}`} active={scope === "mine"}>
        <UserRound className="mr-1.5 size-3.5" strokeWidth={1.5} /> Mi agenda
      </SegmentedLink>
      {teamAvailable ? (
        <SegmentedLink href={`/leads/agenda?view=${view}&date=${date}&scope=team`} active={scope === "team"}>
          <UsersRound className="mr-1.5 size-3.5" strokeWidth={1.5} /> Equipo
        </SegmentedLink>
      ) : (
        <span className="flex h-7 cursor-not-allowed items-center rounded-[3px] px-3 text-[13px] text-lm-ink-3 opacity-50" title="Falta aplicar la actualización de base de datos">
          <UsersRound className="mr-1.5 size-3.5" strokeWidth={1.5} /> Equipo
        </span>
      )}
    </Segmented>
  );
}
