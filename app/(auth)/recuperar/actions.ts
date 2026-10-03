"use server";

import { z } from "zod";

import { isAllowedEmail } from "@/lib/auth/allowlist";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export type ResetResult = { ok: boolean; message: string };

const emailSchema = z.string().trim().toLowerCase().email("Mail inválido.");

/**
 * Paso 1: manda el código de 6 dígitos. La respuesta es la misma exista o no
 * la cuenta, para no revelar qué mails están registrados. El mail sale con la
 * plantilla "Reset Password" de Supabase, que tiene que mostrar {{ .Token }}
 * (ver SETUP.md).
 */
export async function requestPasswordReset(rawEmail: string): Promise<ResetResult> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Mail inválido." };

  if (isAllowedEmail(parsed.data)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data);
    // 429 = pidió otro código demasiado rápido. Es lo único que vale la pena decir.
    if (error?.status === 429) {
      return { ok: false, message: "Pediste un código hace muy poco. Esperá un minuto y probá de nuevo." };
    }
  }

  return { ok: true, message: "Si el mail tiene cuenta, te llegó un código de 6 dígitos." };
}

const verifySchema = z.object({
  email: emailSchema,
  token: z.string().regex(/^\d{6}$/, "El código tiene 6 dígitos."),
});

/** Paso 2: canjea el código por una sesión (el cliente de servidor escribe las cookies). */
export async function verifyResetCode(email: string, token: string): Promise<ResetResult> {
  const parsed = verifySchema.safeParse({ email, token });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Código inválido." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ ...parsed.data, type: "recovery" });
  if (error) return { ok: false, message: "El código es incorrecto o venció." };

  return { ok: true, message: "Código verificado." };
}

const passwordSchema = z
  .object({
    password: z.string().min(6, "La contraseña necesita al menos 6 caracteres."),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, { message: "Las contraseñas no coinciden." });

/** Paso 3: con la sesión que dejó el paso 2, fija la contraseña nueva. */
export async function updatePassword(password: string, confirm: string): Promise<ResetResult> {
  const parsed = passwordSchema.safeParse({ password, confirm });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Contraseña inválida." };

  if (!(await getCurrentUser())) return { ok: false, message: "La sesión venció. Pedí un código nuevo." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return {
      ok: false,
      message: error.code === "same_password" ? "Elegí una contraseña distinta a la anterior." : "No se pudo guardar la contraseña.",
    };
  }

  return { ok: true, message: "Contraseña actualizada." };
}
