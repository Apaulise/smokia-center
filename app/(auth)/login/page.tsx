import { LoginScreen } from "./login-screen";

export const metadata = { title: "Ingresar · Awareness AI" };

/**
 * Google OAuth requiere configurar el consent screen antes de poder probar
 * login de verdad (CLAUDE.md, decisión "Login: Google OAuth"). Mientras eso
 * no está hecho, se loguea por email/contraseña para poder testear la app.
 * Volver a `true` cuando el consent screen esté configurado.
 */
const GOOGLE_LOGIN_ENABLED = false;

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/leads";
  const failed = params.error !== undefined;

  return <LoginScreen next={next} failed={failed} googleEnabled={GOOGLE_LOGIN_ENABLED} />;
}
