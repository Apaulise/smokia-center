import "server-only";

import { missingCrm, readCrmPages } from "@/lib/crm/db";
import { createClient } from "@/lib/supabase/server";
import type { MeetingContext } from "./model";

export async function listMeetingNotes({ kind, id }: MeetingContext) {
  const db = await createClient();
  const column = kind === "lead" ? "lead_id" : "client_id";
  const result = await readCrmPages((from, to) => db.from("crm_meeting_notes")
    .select("id,recording_id,stage,title,meeting_at,fathom_url,summary,action_items")
    .eq(column, id).order("meeting_at", { ascending: false }).order("id").range(from, to));
  return { notes: result.data, missing: missingCrm(result.error), error: Boolean(result.error) };
}
