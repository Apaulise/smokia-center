import { NextResponse } from "next/server";

import { isAllowedEmail } from "@/lib/auth/allowlist";
import { createClient } from "@/lib/supabase/server";

/**
 * Vuelta del OAuth de Google. Supabase manda un `code` que se canjea por la
 * sesión; el cliente de servidor escribe las cookies en la respuesta.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/leads";

  // Sólo rutas internas: un `next` absoluto sería un open redirect.
  const destination = next.startsWith("/") && !next.startsWith("//")
    ? next
    : "/leads";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=exchange_failed`);
  }

  // Google deja entrar a cualquier cuenta: la allowlist decide quién se queda.
  if (!isAllowedEmail(data.user?.email)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/login?error=not_allowed`);
  }

  return NextResponse.redirect(`${origin}${destination}`);
}
