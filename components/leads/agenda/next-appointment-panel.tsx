import { AlertTriangle, TrendingUp } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/leads/ui/button";
import type { NextAppointmentBriefing } from "@/lib/leads/queries";
import { STATUS_LABEL } from "@/lib/leads/status";

const KIND_ICON = { DOLOR: AlertTriangle, OBJECION: AlertTriangle, SENAL_COMPRA: TrendingUp };

function relativeDayLabel(iso: string): string {
  const days = Math.round((new Date(iso).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  if (days <= 0) return "hoy";
  if (days === 1) return "mañana";
  return `en ${days} días`;
}

/**
 * Panel lateral de /leads/agenda (Design System §05): la próxima reunión
 * agendada con lo que hay para preparar — señales confirmadas del lead,
 * mismas que alimentan el Copilot de la ficha (Plan §1.13). Sin reunión
 * próxima, no hay nada que preparar: se omite en vez de mostrar un estado
 * vacío que no aporta nada.
 */
export function NextAppointmentPanel({ briefing }: { briefing: NextAppointmentBriefing | null }) {
  if (!briefing) return null;
  const { appointment, lead, prepPoints } = briefing;

  const when = new Date(appointment.startsAt).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
  const startTime = new Date(appointment.startsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  const endTime = new Date(appointment.endsAt).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });

  return (
    <aside className="flex w-full shrink-0 flex-col gap-6 border-l border-lm-line px-6 py-6 lg:w-[300px]">
      <div className="flex flex-col gap-3">
        <p className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
          Próxima · {relativeDayLabel(appointment.startsAt)}
        </p>
        <Link href={`/leads/${lead.id}`} className="font-lm-sans text-lg font-semibold text-lm-ink hover:text-lm-signal-text">
          {lead.name}
        </Link>
        {appointment.title !== lead.name ? <p className="text-[13px] text-lm-ink-2">{appointment.title}</p> : null}

        <dl className="flex flex-col gap-1.5 text-[13px]">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-lm-ink-3">Cuándo</dt>
            <dd className="font-mono text-lm-ink">
              {when} · {startTime}-{endTime}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-lm-ink-3">Etapa</dt>
            <dd className="text-lm-ink">{STATUS_LABEL[lead.status]}</dd>
          </div>
          {lead.listName ? (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-lm-ink-3">Origen</dt>
              <dd className="truncate text-lm-ink">{lead.listName}</dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-1 flex items-center gap-2">
          {appointment.meetingUrl ? (
            <ButtonLink href={appointment.meetingUrl} variant="secondary" size="sm" target="_blank" rel="noreferrer">
              Unirse a Meet
            </ButtonLink>
          ) : null}
          <ButtonLink href={`/leads/${lead.id}`} variant="secondary" size="sm">
            Abrir lead
          </ButtonLink>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-lm-line pt-4">
        <p className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Para preparar</p>
        {prepPoints.length > 0 ? (
          <ul className="flex flex-col gap-2.5">
            {prepPoints.map((point, index) => {
              const Icon = KIND_ICON[point.kind];
              return (
                <li key={index} className="flex gap-2 text-[13px] text-lm-ink-2">
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
                  <span>{point.description}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-lm-ink-3">Todavía no hay señales confirmadas de este lead para preparar la reunión.</p>
        )}
      </div>
    </aside>
  );
}
