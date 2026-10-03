"use server";

import { z } from "zod";

import { isAllowedEmail } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/supabase/server";

const signUpSchema = z.object({
  email: z.string().trim().toLowerCase().email("Mail inválido."),
  password: z.string().min(6, "La contraseña necesita al menos 6 caracteres."),
});

/**
 * Registro por mail. Va por el servidor (no por el cliente, como el sign-in)
 * para chequear la allowlist ANTES de que Supabase cree la cuenta y mande el
 * mail de confirmación.
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ ok: boolean; message: string }> {
  const parsed = signUpSchema.safeParse({ email, password });
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  if (!isAllowedEmail(parsed.data.email)) {
    return { ok: false, message: "Este mail no tiene acceso a Awareness AI." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp(parsed.data);
  if (error) return { ok: false, message: error.message };

  return { ok: true, message: "Cuenta creada. Confirmá el mail que te llegó para poder ingresar." };
}
