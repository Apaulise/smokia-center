import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isAllowedEmail } from "@/lib/auth/allowlist";

/** Rutas accesibles sin sesión. Todo lo demás exige login. */
const PUBLIC_PATHS = ["/login", "/auth/callback", "/recuperar"];

export async function proxy(request: NextRequest) {
  // `?preview=1` lo usa la pantalla global para embeber la home de cada gestor en
  // un iframe: el layout lee este header para omitir el sidebar. Sólo cambia el
  // marco visual; la autenticación y los datos son los mismos.
  if (request.nextUrl.searchParams.get("preview") === "1") {
    request.headers.set("x-preview", "1");
  } else {
    request.headers.delete("x-preview");
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // getClaims valida la firma del JWT. No cambiar por getSession().
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims);

  const { pathname } = request.nextUrl;

  // Sesión válida pero de un mail fuera de la allowlist (p. ej. una cuenta de
  // Google ajena que Supabase llegó a crear): se cierra y vuelve al login.
  if (isLoggedIn && !isAllowedEmail(data?.claims.email as string | undefined)) {
    await supabase.auth.signOut();
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=not_allowed";
    const redirect = NextResponse.redirect(url);
    // signOut escribió en `response` las cookies vencidas; pasan al redirect.
    for (const cookie of response.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  }

  const isPublic = PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );

  if (!isLoggedIn && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Para volver a donde quería entrar, después del login.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Todo excepto:
     *  - toda la rama /_next/ (estáticos, imágenes, y el socket de HMR de
     *    Turbopack en /_next/hmr). Dejar pasar el proxy por el socket de HMR
     *    rompe el handshake y el navegador entra en loop de reconexión.
     *  - /api/*, que se autentica con su propio secreto. El webhook de Apify
     *    llega sin sesión y tiene que poder entrar.
     */
    "/((?!_next/|favicon.ico|api/|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
