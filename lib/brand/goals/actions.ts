"use server";

import { revalidatePath } from "next/cache";

import type { BrandPlatform } from "@/lib/brand/sources/types";
import { todayIso } from "@/lib/leads/calendar";
import { createClient, requireUser } from "@/lib/supabase/server";

import { formatCount } from "./progress";
import { getFollowerSnapshots } from "./queries";
import { GoalInput } from "./schema";

export type DefineGoalResult = { ok: true } | { ok: false; message: string };

/**
 * Define la meta de seguidores. Redefinirla archiva la anterior: nunca hay dos
 * activas (índice único parcial), y `brand_define_goal` lo hace en una sola
 * transacción para que un fallo a medias no deje al usuario sin meta.
 *
 * Corre con la sesión del usuario (sin service role): RLS filtra y su
 * `WITH CHECK` impide escribir un owner_id ajeno.
 */
export async function defineBrandGoal(platform: BrandPlatform, input: GoalInput): Promise<DefineGoalResult> {
  await requireUser();

  const parsed = GoalInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Los datos no son válidos." };
  const { targetFollowers, deadline } = parsed.data;

  // La meta se mide contra lo que hay hoy: sin ninguna foto del contador no hay desde dónde partir.
  const latest = (await getFollowerSnapshots(platform)).at(-1);
  if (!latest) {
    return { ok: false, message: "Todavía no hay un conteo de seguidores. Sincronizá la cuenta primero." };
  }
  if (targetFollowers <= latest.followers) {
    return {
      ok: false,
      message: `La meta tiene que ser mayor a tus seguidores actuales (${formatCount(latest.followers)}).`,
    };
  }
  if (deadline !== null && deadline <= todayIso()) {
    return { ok: false, message: "El plazo tiene que ser una fecha futura." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("brand_define_goal", {
    p_platform: platform,
    p_target: targetFollowers,
    p_baseline: latest.followers,
    p_baseline_date: latest.day,
    ...(deadline ? { p_deadline: deadline } : {}),
  });
  if (error) return { ok: false, message: "No se pudo guardar la meta." };

  revalidatePath("/marca");
  return { ok: true };
}
