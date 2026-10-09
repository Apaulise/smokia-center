"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient, requireUser } from "@/lib/supabase/server";

import { AVATAR_BUCKET, parseDicebearUrl, uploadedAvatarPath } from "./avatars";

export type ProfileResult = { ok: true } | { ok: false; message: string };

const schema = z.object({
  alias: z.string().trim().min(2, "El alias necesita al menos 2 caracteres.").max(30, "El alias admite hasta 30 caracteres."),
  avatarUrl: z.string().max(500).nullable(),
});

export async function saveProfile(input: { alias: string; avatarUrl: string | null }): Promise<ProfileResult> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  let avatarUrl = parsed.data.avatarUrl;

  // El avatar tiene que ser de la biblioteca o una foto propia: nunca una URL arbitraria.
  if (avatarUrl) {
    const uploaded = uploadedAvatarPath(avatarUrl, supabaseUrl);
    if (uploaded) {
      if (!uploaded.startsWith(`${user.id}/`)) return { ok: false, message: "Esa foto no es tuya." };
    } else {
      avatarUrl = parseDicebearUrl(avatarUrl);
      if (!avatarUrl) return { ok: false, message: "El avatar no es válido." };
    }
  }

  const supabase = await createClient();
  const { data: previous } = await supabase.from("profiles").select("avatar_url").maybeSingle();

  const { error } = await supabase
    .from("profiles")
    .upsert({ owner_id: user.id, alias: parsed.data.alias, avatar_url: avatarUrl }, { onConflict: "owner_id" });
  if (error) return { ok: false, message: "No se pudo guardar el perfil." };

  // La foto anterior queda huérfana al cambiarla: se borra (mejor esfuerzo).
  const oldPath = uploadedAvatarPath(previous?.avatar_url, supabaseUrl);
  if (oldPath && previous?.avatar_url !== avatarUrl && oldPath.startsWith(`${user.id}/`)) {
    await supabase.storage.from(AVATAR_BUCKET).remove([oldPath]);
  }

  revalidatePath("/");
  return { ok: true };
}
