import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { Database } from "./database.types";

/**
 * Cliente para Server Components y Server Actions.
 * Respeta RLS: consulta como el usuario logueado.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Un Server Component no puede escribir cookies. No es un error:
            // el middleware ya refrescó la sesión en este request.
          }
        },
      },
    },
  );
}

/**
 * Devuelve el usuario validando el JWT contra las claves públicas del proyecto.
 *
 * Usar SIEMPRE esto en el servidor, nunca getSession(): getSession() lee la
 * cookie sin garantizar que el token siga siendo válido, así que no sirve
 * para autorizar.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;

  return {
    id: data.claims.sub as string,
    email: data.claims.email as string | undefined,
  };
}

/** Igual que getCurrentUser pero lanza si no hay sesión. Para Server Actions. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("No autenticado");
  return user;
}
