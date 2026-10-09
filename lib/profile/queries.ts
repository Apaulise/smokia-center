import { createClient } from "@/lib/supabase/server";

export interface Profile {
  alias: string | null;
  avatarUrl: string | null;
}

/** Perfil del usuario actual; sin fila todavía, todo en null (RLS filtra por owner). */
export async function getProfile(): Promise<Profile> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("alias, avatar_url").maybeSingle();
  return { alias: data?.alias ?? null, avatarUrl: data?.avatar_url ?? null };
}

/** Nombre a mostrar: el alias, o la parte local del mail (nunca el mail completo). */
export function displayName(profile: Profile, email: string | undefined) {
  return profile.alias ?? email?.split("@")[0] ?? "Cuenta";
}
