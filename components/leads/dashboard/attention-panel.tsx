import { CalendarClock, Clock } from "lucide-react";
import Link from "next/link";

import { EmptyLine } from "@/components/leads/ui/feedback";
import type { listStaleLeads, listUpcomingAppointments } from "@/lib/leads/queries";

type Appointments = Awaited<ReturnType<typeof listUpcomingAppointments>>;
type StaleLeads = Awaited<ReturnType<typeof listStaleLeads>>;

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Próximas reuniones agendadas — enlaza directo a la ficha del lead. */
export function UpcomingAppointments({ appointments }: { appointments: Appointments }) {
  if (appointments.length === 0) {
    return <EmptyLine>No hay reuniones agendadas próximamente.</EmptyLine>;
  }

  return (
    <ul className="flex flex-col">
      {appointments.map((appt) => (
        <li key={appt.id} className="flex items-center gap-3 border-b border-lm-line py-2.5 last:border-b-0">
          <CalendarClock className="size-4 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
          <div className="min-w-0 flex-1">
            {appt.leads ? (
              <Link href={`/leads/${appt.leads.id}`} className="block truncate text-[13px] font-medium text-lm-ink hover:text-lm-signal-text">
                {appt.leads.name}
              </Link>
            ) : (
              <p className="truncate text-[13px] font-medium text-lm-ink">{appt.title}</p>
            )}
            <p className="truncate text-xs text-lm-ink-3">{appt.title}</p>
          </div>
          <time className="shrink-0 font-mono text-xs text-lm-ink-3">
            {new Date(appt.starts_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** Leads sin tocar hace más de N días — la lista que dice a quién escribirle hoy. */
export function StaleLeadsList({ leads }: { leads: StaleLeads }) {
  if (leads.length === 0) {
    return <EmptyLine>Todos los leads activos tienen seguimiento al día.</EmptyLine>;
  }

  return (
    <ul className="flex flex-col">
      {leads.map((lead) => {
        // Plan §1.16: un AHORA_NO con next_action_at vencido no es "sin tocar" — es un seguimiento que llegó su fecha.
        const followUpDue = "next_action_at" in lead && lead.next_action_at && new Date(lead.next_action_at) <= new Date();
        const since = daysSince(lead.last_contacted_at ?? lead.created_at);
        return (
          <li key={lead.id} className="group flex items-center gap-3 border-b border-lm-line py-2.5 last:border-b-0 hover:bg-lm-raised">
            <Clock className="size-4 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
            <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-[13px] font-medium text-lm-ink group-hover:text-lm-signal-text">
              {lead.name}
            </Link>
            <span className="shrink-0 font-mono text-xs text-lm-ink-3">
              {followUpDue ? "seguimiento vencido" : lead.last_contacted_at ? `${since} d sin contacto` : `${since} d sin tocar`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
