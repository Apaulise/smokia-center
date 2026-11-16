import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AutomationsClient } from "@/components/leads/chats/automations-client";
import { HeaderBar } from "@/components/leads/ui/page-header";
import { listContentAutomations, loadAutomationSetup } from "@/lib/chats/automation-actions";

export const metadata = { title: "Automatizaciones · SmokIA" };

/**
 * §1.26 sub-paso 4: elegir los moldes TOFU/MOFU y clonarlos por pieza
 * (reel + palabra clave + recurso) en un workflow y una automatización de
 * comentario nuevos en Zernio. No reemplaza ManyChat solo: hay que apagarlo a
 * mano pieza por pieza (el formulario lo recuerda).
 */
export default async function AutomatizacionesPage() {
  const [setup, automations] = await Promise.all([loadAutomationSetup(), listContentAutomations()]);

  return (
    <>
      <HeaderBar
        breadcrumb={
          <span className="flex items-center gap-2">
            <Link href="/leads/chats" className="inline-flex items-center gap-1 text-lm-ink-2 hover:text-lm-ink">
              <ArrowLeft className="size-3.5" strokeWidth={1.5} />
              Chats
            </Link>
            / Automatizaciones
          </span>
        }
      />
      <AutomationsClient ready={setup.ready && automations.ready} accountReady={setup.accountReady} candidates={setup.candidates} templates={setup.templates} automations={automations.items} />
    </>
  );
}
