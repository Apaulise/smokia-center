import { Mail } from "lucide-react";
import { Mailbox } from "@/components/leads/mail/mailbox";
import { ButtonLink } from "@/components/ui/button";
import { HeaderBar } from "@/components/ui/page-header";
import { mailboxStatus } from "@/lib/mail/connection";

export const metadata = { title: "Correo" };

export default async function MailPage() {
  const status = await mailboxStatus();
  return <>
    <HeaderBar breadcrumb="Gestor de Leads / Correo" />
    {status.email && status.configured && status.connectionId ? <Mailbox key={status.connectionId} email={status.email} connection={status.connectionId} /> : (
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Correo</h1>
          <p className="mt-2 text-sm text-lm-ink-2">La casilla de tu empresa, dentro de ALTAB.</p>
        </div>
        <div className="rounded-lm-xl border border-lm-line bg-lm-ink/4 p-6 sm:p-8">
          <Mail className="mb-4 size-6 text-lm-signal-text" />
          <h2 className="text-lg font-semibold">Conectá Gmail</h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-lm-ink-2">
            {!status.ready ? "Aplicá la migración de Correo en este entorno."
              : "Autorizá la cuenta de Gmail de la empresa en Configuración o pedile al titular que la comparta con el equipo."}
          </p>
          <ButtonLink href="/configuracion#gmail" className="mt-5 min-h-10" variant="primary">Ir a Configuración</ButtonLink>
        </div>
      </section>
    )}
  </>;
}
