"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import type { Json } from "@/lib/supabase/database.types";
import { isMissingSchema } from "@/lib/ops/schema";
import { createClient, requireUser } from "@/lib/supabase/server";

import { asWeekly } from "./db";
import { parseChanges } from "./parse";
import { WEEKLY_CHANGE_STATUSES } from "./types";

export type WeeklyActionState = { ok: true } | { ok: false; message: string };

const reviewSchema = z
  .object({
    id: z.uuid(),
    target: z.enum(["conclusion", "change"]),
    changeKey: z.string().trim().min(1).max(80).optional(),
    status: z.enum(WEEKLY_CHANGE_STATUSES),
    result: z.string().trim().max(2000),
  })
  .superRefine((value, context) => {
    if (value.target === "change" && !value.changeKey) {
      context.addIssue({ code: "custom", path: ["changeKey"], message: "Falta el cambio." });
    }
  });

/** Cambia el estado o el resultado. No reescribe el texto que publicó el agente. */
export async function updateWeeklyReview(input: {
  id: string;
  target: "conclusion" | "change";
  changeKey?: string;
  status: (typeof WEEKLY_CHANGE_STATUSES)[number];
  result: string;
}): Promise<WeeklyActionState> {
  await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "No se pudo guardar el estado." };

  const supabase = asWeekly(await createClient());
  const { data: row, error } = await supabase
    .from("weekly_reports")
    .select("id, conclusion_status, conclusion_result, changes")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (error) {
    if (isMissingSchema(error)) return { ok: false, message: "Falta aplicar la migración del análisis semanal." };
    console.error("weekly_reports: no se pudo leer para editar", error.code);
    return { ok: false, message: "No se pudo guardar el estado." };
  }
  if (!row) return { ok: false, message: "Ese análisis no está en tu cuenta." };

  const result = parsed.data.result.trim() ? parsed.data.result.trim() : null;
  if (parsed.data.target === "conclusion") {
    if (row.conclusion_status === parsed.data.status && (row.conclusion_result ?? null) === result) return { ok: true };
    const { error: updateError } = await supabase
      .from("weekly_reports")
      .update({ conclusion_status: parsed.data.status, conclusion_result: result })
      .eq("id", row.id);
    if (updateError) {
      console.error("weekly_reports: no se pudo guardar la conclusión", updateError.code);
      return { ok: false, message: "No se pudo guardar el estado." };
    }
  } else {
    const changes = parseChanges(row.changes);
    const index = changes.findIndex((change) => change.key === parsed.data.changeKey);
    if (index < 0) return { ok: false, message: "Ese cambio no está en el análisis." };
    if (changes[index].status === parsed.data.status && changes[index].result === result) return { ok: true };
    changes[index] = { ...changes[index], status: parsed.data.status, result };
    const { error: updateError } = await supabase
      .from("weekly_reports")
      .update({ changes: JSON.parse(JSON.stringify(changes)) as Json })
      .eq("id", row.id);
    if (updateError) {
      console.error("weekly_reports: no se pudo guardar el cambio", updateError.code);
      return { ok: false, message: "No se pudo guardar el estado." };
    }
  }

  revalidatePath("/operaciones/analisis");
  return { ok: true };
}
