import { z } from "zod";

export const meetingStages = [
  { value: "diagnosis", label: "Diagnóstico" },
  { value: "sale", label: "Venta" },
] as const;

export const meetingStage = z.enum(["diagnosis", "sale"]);
export const recordingId = z.string().regex(/^[1-9][0-9]{0,15}$/);
export const meetingContext = z.object({ kind: z.enum(["lead", "client"]), id: z.uuid() });
export type MeetingContext = z.infer<typeof meetingContext>;

export const meetingActionItems = z.array(z.object({
  description: z.string(),
  completed: z.boolean(),
}));

const summary = z.object({ markdown_formatted: z.string().nullish() });
export const summaryResponse = z.object({ summary: summary.nullish() });

export const fathomPage = z.object({
  items: z.array(z.object({
    recording_id: z.number().int().positive().transform(String).pipe(recordingId),
    title: z.string().nullish(),
    meeting_title: z.string().nullish(),
    created_at: z.iso.datetime({ offset: true }),
    recording_start_time: z.iso.datetime({ offset: true }).nullish(),
    url: z.string().nullish(),
    default_summary: summary.nullish(),
    action_items: meetingActionItems.nullish(),
  })),
  next_cursor: z.string().nullish(),
});

export type FathomMeeting = z.infer<typeof fathomPage>["items"][number];
export type MeetingChoice = { id: string; title: string; at: string; cursor: string | null };

export function meetingChoice(meeting: FathomMeeting, cursor: string | null): MeetingChoice {
  return {
    id: meeting.recording_id,
    title: (meeting.meeting_title?.trim() || meeting.title?.trim() || "Reunión de Fathom").slice(0, 300),
    at: meeting.recording_start_time ?? meeting.created_at,
    cursor,
  };
}

export function fathomLink(value: string | null | undefined) {
  if (!value || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && ["fathom.video", "app.fathom.video", "fathom.ai", "app.fathom.ai"].includes(url.host)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
