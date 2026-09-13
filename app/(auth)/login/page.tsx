import { EmailSignInForm } from "./email-form";
import { GoogleSignInButton } from "./google-button";

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

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      {/* Foco visual único de la pantalla (manual §5): el glow va acá y en nada más. */}
      <div className="glow-cyan w-full max-w-sm rounded-[24px] border border-cyan/20 bg-elevated/80 p-8 backdrop-blur-sm">
        <p className="text-xs font-medium tracking-[0.2em] text-cyan uppercase">
          Awareness AI
        </p>

        <h1 className="mt-4 text-3xl">
          Tu negocio,
          <br />
          <span className="text-brand-gradient">en un solo panel</span>
        </h1>

        <p className="mt-3 text-sm leading-relaxed text-muted">
          Leads, facturación y marca personal. Empezá por donde importa.
        </p>

        <div className="mt-8">
          {GOOGLE_LOGIN_ENABLED ? (
            <GoogleSignInButton next={next} />
          ) : (
            <EmailSignInForm next={next} />
          )}
        </div>

        {failed ? (
          <p className="mt-4 text-sm text-danger">
            No pudimos completar el ingreso. Probá de nuevo.
          </p>
        ) : null}
      </div>
    </main>
  );
}
