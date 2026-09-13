import { CalendarClock, Mail, MessageSquareText, PhoneCall, StickyNote, Users } from "lucide-react";

import { ACTIVITY_LABEL, STATUS_LABEL } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

type Activity = Database["public"]["Tables"]["lead_activities"]["Row"];

const ICON: Record<Activity["type"], typeof StickyNote> = {
  NOTA: StickyNote,
  WHATSAPP: MessageSquareText,
  EMAIL: Mail,
  LLAMADA: PhoneCall,
  CAMBIO_ESTADO: CalendarClock,
  REUNION: Users,
};

/** Timeline completo de actividades del lead (Plan §1.3) — se arma solo, nadie lo carga a mano. */
export function LeadTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) {
    return <p className="text-sm text-muted">Todavía no hay actividad registrada.</p>;
  }

  return (
    <ol className="space-y-4">
      {activities.map((activity) => {
        const Icon = ICON[activity.type];
        return (
          <li key={activity.id} className="flex gap-3">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line bg-surface/60 text-cyan">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0 flex-1 border-b border-line/40 pb-4 last:border-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{ACTIVITY_LABEL[activity.type]}</p>
                <time className="text-xs text-muted">
                  {new Date(activity.occurred_at).toLocaleString("es-AR", { dateStyle: "medium", timeStyle: "short" })}
                </time>
              </div>
              {activity.content ? <p className="mt-1 text-sm text-muted">{activity.content}</p> : null}
              {activity.to_status ? (
                <p className="mt-1 text-xs text-muted">
                  {activity.from_status ? `${STATUS_LABEL[activity.from_status]} → ` : ""}
                  {STATUS_LABEL[activity.to_status]}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
