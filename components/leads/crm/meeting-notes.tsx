import { CalendarDays, ChevronDown } from "lucide-react";

import { Markdown } from "@/components/brand/markdown";
import { ButtonExternalLink, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/section";
import { fathomLink, meetingActionItems, meetingStages, type MeetingContext } from "@/lib/fathom/model";
import { listMeetingNotes } from "@/lib/fathom/queries";
import { getFathomKeyStatus } from "@/lib/settings/queries";
import { ImportFathomMeeting } from "./import-fathom-meeting";

const formatDate = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
});

export async function MeetingNotes({ context }: { context: MeetingContext }) {
  const [{ notes, error, missing }, { configured }] = await Promise.all([
    listMeetingNotes(context), getFathomKeyStatus(),
  ]);

  return (
    <Section title="Minutas de reuniones" className="min-w-0 border-t border-lm-line pt-4"
      action={error ? undefined : configured
        ? <ImportFathomMeeting context={context} imported={notes.map((note) => note.recording_id)} />
        : <ButtonLink href="/configuracion#fathom" variant="ghost">Conectar Fathom</ButtonLink>}>
      {error ? (
        <p className="text-sm text-lm-ink-2">{missing ? "Falta aplicar la migración de minutas del CRM." : "No se pudieron cargar las minutas."}</p>
      ) : !notes.length ? (
        <p className="text-sm text-lm-ink-2">Todavía no hay minutas en esta ficha.</p>
      ) : (
        <div className="grid min-w-0 gap-4">
          {meetingStages.map(({ value, label }) => {
            const group = notes.filter((note) => note.stage === value);
            if (!group.length) return null;
            return (
              <div key={value} className="grid min-w-0 gap-2">
                <h4 className="text-xs font-semibold text-lm-ink-2">{label}</h4>
                {group.map((note) => {
                  const url = fathomLink(note.fathom_url);
                  const items = meetingActionItems.safeParse(note.action_items);
                  return (
                    <details key={note.id} className="group min-w-0 rounded-lm-md border border-lm-line bg-lm-ink/3">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm text-lm-ink [&::-webkit-details-marker]:hidden">
                        <CalendarDays className="size-4 shrink-0 text-lm-signal-text" aria-hidden />
                        <span className="min-w-0 flex-1 wrap-anywhere">
                          <span className="block font-medium">{note.title}</span>
                          <time dateTime={note.meeting_at} className="block text-xs text-lm-ink-3">{formatDate.format(new Date(note.meeting_at))}</time>
                        </span>
                        <ChevronDown className="size-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden />
                      </summary>
                      <div className="grid min-w-0 gap-3 border-t border-lm-line px-3 py-3">
                        <Markdown allowImages={false} className="wrap-anywhere">{note.summary}</Markdown>
                        {items.success && items.data.length ? (
                          <div>
                            <h5 className="text-sm font-semibold">Próximos pasos</h5>
                            <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-lm-ink-2">
                              {items.data.map((item, i) => <li key={i} className="wrap-anywhere">{item.description}{item.completed ? " (completado)" : ""}</li>)}
                            </ul>
                          </div>
                        ) : null}
                        {url ? <ButtonExternalLink href={url} className="w-fit" variant="ghost">Abrir en Fathom</ButtonExternalLink> : null}
                      </div>
                    </details>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
