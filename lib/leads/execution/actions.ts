"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, requireUser } from "@/lib/supabase/server";

export type ActionState = { ok: boolean; message: string } | null;

// Los porcentajes llegan como en la planilla (15 = 15 %) y se guardan como fracción.
const percent = z.coerce
  .number({ error: "Ingresá un porcentaje." })
  .gt(0, "Tiene que ser mayor a 0 %.")
  .max(100, "No puede pasar de 100 %.")
  .transform((value) => value / 100);

const goalSchema = z.object({
  monthlyRevenueTarget: z.coerce.number({ error: "Ingresá un monto." }).positive("Tiene que ser mayor a 0.").max(9_999_999_999),
  avgTicket: z.coerce.number({ error: "Ingresá un monto." }).positive("Tiene que ser mayor a 0.").max(9_999_999_999),
  bookingRate: percent,
  showRate: percent,
  closeRate: percent,
  workingDaysPerMonth: z.coerce.number().int().min(1, "Mínimo 1 día.").max(31, "Máximo 31 días."),
  workingDaysPerWeek: z.coerce.number().int().min(1, "Mínimo 1 día.").max(7, "Máximo 7 días."),
});

/**
 * Define (o redefine) el objetivo de la cadena de ejecución (Plan §1.22).
 * `sales_define_goal` archiva el activo e inserta el nuevo en una sola
 * transacción: con dos llamadas separadas, un fallo entre ellas dejaría al
 * usuario sin objetivo.
 */
export async function defineSalesGoal(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();
  const parsed = goalSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("sales_define_goal", {
    p_revenue: parsed.data.monthlyRevenueTarget,
    p_ticket: parsed.data.avgTicket,
    p_booking_rate: parsed.data.bookingRate,
    p_show_rate: parsed.data.showRate,
    p_close_rate: parsed.data.closeRate,
    p_days_per_month: parsed.data.workingDaysPerMonth,
    p_days_per_week: parsed.data.workingDaysPerWeek,
  });
  if (error) return { ok: false, message: "No se pudo guardar el objetivo." };

  revalidatePath("/leads/objetivo");
  revalidatePath("/leads");
  return { ok: true, message: "Objetivo guardado." };
}
