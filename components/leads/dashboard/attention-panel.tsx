import { CalendarClock, Clock } from "lucide-react";
import Link from "next/link";

import type { listStaleLeads, listUpcomingAppointments } from "@/lib/leads/queries";

type Appointments = Awaited<ReturnType<typeof listUpcomingAppointments>>;
type StaleLeads = Awaited<ReturnType<typeof listStaleLeads>>;

function daysSince(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/** Próximas reuniones agendadas (Plan §1.4) — enlaza directo a la ficha del lead. */
export function UpcomingAppointments({ appointments }: { appointments: Appointments }) {
  if (appointments.length === 0) {
    return <p className="text-sm text-muted">No hay reuniones agendadas próximamente.</p>;
  }

  return (
    <ul className="space-y-3">
      {appointments.map((appt) => (
        <li key={appt.id} className="flex items-start gap-3">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface/60 text-cyan">
            <CalendarClock className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            {appt.leads ? (
              <Link href={`/leads/${appt.leads.id}`} className="block truncate text-sm font-medium text-ink hover:text-cyan">
                {appt.leads.name}
              </Link>
            ) : (
              <p className="truncate text-sm font-medium text-ink">{appt.title}</p>
            )}
            <p className="truncate text-xs text-muted">{appt.title}</p>
          </div>
          <time className="shrink-0 text-xs text-muted">
            {new Date(appt.starts_at).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
          </time>
        </li>
      ))}
    </ul>
  );
}

/** Leads sin tocar hace más de N días (Plan §1.4) — la lista que dice a quién escribirle hoy. */
export function StaleLeadsList({ leads }: { leads: StaleLeads }) {
  if (leads.length === 0) {
    return <p className="text-sm text-muted">Todos los leads activos tienen seguimiento al día.</p>;
  }

  return (
    <ul className="space-y-3">
      {leads.map((lead) => {
        const since = daysSince(lead.last_contacted_at ?? lead.created_at);
        return (
          <li key={lead.id} className="flex items-center gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface/60 text-violet">
              <Clock className="size-4" />
            </div>
            <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-cyan">
              {lead.name}
            </Link>
            <span className="tabular shrink-0 text-xs text-muted">
              {lead.last_contacted_at ? `${since} d sin contacto` : `${since} d sin tocar`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
