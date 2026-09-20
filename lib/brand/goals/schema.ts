import { z } from "zod";

import type { Database } from "@/lib/supabase/database.types";

export type BrandGoal = Database["public"]["Tables"]["brand_goals"]["Row"];

/** Un techo que evita un typo de cinco ceros de más y que cabe en el `integer` de la base. */
export const GOAL_MAX_FOLLOWERS = 100_000_000;

/**
 * Lo que se pide al definir la meta. Que sea mayor a los seguidores actuales y
 * que el plazo sea futuro no se valida acá: dependen de la base y del día de
 * hoy, y los chequea la acción (`defineBrandGoal`).
 */
export const GoalInput = z.object({
  targetFollowers: z
    .number({ error: "Poné la cantidad de seguidores que querés alcanzar." })
    .int("Tiene que ser un número entero.")
    .min(1, "Tiene que ser mayor a 0.")
    .max(GOAL_MAX_FOLLOWERS, "Ese número es demasiado grande."),
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
    .nullish()
    .transform((value) => value ?? null),
});

export type GoalInput = z.input<typeof GoalInput>;
