import { ProfileAvatar } from "@/components/shell/profile-avatar";
import { MiniBar, Table, Td, TdSub, Th, Tr } from "@/components/leads/ui/table";
import type { MemberSummary } from "@/lib/leads/team/summary";

function ofTeam(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

/**
 * Aporte de cada uno al objetivo del equipo (Plan §1.23): contactos de hoy, de
 * la semana y del mes contra la parte que le toca (la meta en partes iguales),
 * más lo que lleva en el embudo. Sólo agregados: nunca los leads del otro.
 */
export function MemberContribution({ members }: { members: MemberSummary[] }) {
  const teamMonth = members.reduce((sum, m) => sum + m.contacts.month, 0);

  return (
    <Table>
      <thead>
        <tr>
          <Th>Persona</Th>
          <Th align="right">Hoy</Th>
          <Th align="right">Semana</Th>
          <Th align="right">Mes</Th>
          <Th align="right">Contactados</Th>
          <Th align="right">Reuniones</Th>
          <Th align="right">Ganados (mes)</Th>
        </tr>
      </thead>
      <tbody>
        {members.map(({ member, isMe, contacts, share, funnel, wonThisMonth }) => (
          <Tr key={member.ownerId}>
            <Td>
              <span className="flex items-center gap-2.5">
                <ProfileAvatar url={member.avatarUrl} name={member.name} className="size-7 text-xs" />
                <span>
                  {member.name}
                  {isMe ? <span className="ml-1.5 text-xs text-lm-ink-3">(vos)</span> : null}
                </span>
              </span>
            </Td>
            <Td numeric>{share ? `${contacts.today} / ${share.today}` : contacts.today}</Td>
            <Td numeric>{share ? `${contacts.week} / ${share.week}` : contacts.week}</Td>
            <Td numeric>
              {share ? `${contacts.month} / ${share.month}` : contacts.month}
              <TdSub>
                <MiniBar percent={ofTeam(contacts.month, teamMonth)} />
                {ofTeam(contacts.month, teamMonth)} % del equipo
              </TdSub>
            </Td>
            <Td numeric>{funnel.contacts_sent}</Td>
            <Td numeric>{funnel.meetings}</Td>
            <Td numeric>{wonThisMonth}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
