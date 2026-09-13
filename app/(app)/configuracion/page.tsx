import { Bot, KeyRound, MessageSquareText, Tags } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { ActorOverridesForm } from "@/components/settings/actor-overrides-form";
import { ApifyKeyForm } from "@/components/settings/apify-key-form";
import { IndustriesManager } from "@/components/settings/industries-manager";
import { TemplatesManager } from "@/components/settings/templates-manager";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getActorOverrides, getApifyKeyStatus, listIndustries, listMessageTemplates } from "@/lib/settings/queries";

export const metadata = { title: "Configuración · Awareness AI" };

export default async function ConfiguracionPage() {
  const [apifyStatus, industries, templates, actorOverrides] = await Promise.all([
    getApifyKeyStatus(),
    listIndustries(),
    listMessageTemplates(),
    getActorOverrides(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Configuración"
        title="Conexiones y preferencias"
        description="API key de Apify, rubros y plantillas de mensajes."
      />
      <div className="space-y-6 px-6 py-8 lg:px-10">
        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="size-4 text-cyan" />
                Apify
              </span>
            }
            description="Necesaria para generar listas de leads desde Google Maps, Instagram y LinkedIn."
          />
          <CardBody>
            <ApifyKeyForm configured={apifyStatus.configured} masked={apifyStatus.masked} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Bot className="size-4 text-violet" />
                Actores de Apify
              </span>
            }
            description="Sobreescriben el actor por default de cada fuente. LinkedIn no tiene uno: hay que cargarlo antes de generar leads de ahí."
          />
          <CardBody>
            <ActorOverridesForm overrides={actorOverrides} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <Tags className="size-4 text-violet" />
                Rubros
              </span>
            }
            description="Categorizan cada lead. Se usan para filtrar la lista y medir qué combinación de rubro y zona cierra mejor."
          />
          <CardBody>
            <IndustriesManager industries={industries} />
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={
              <span className="flex items-center gap-2">
                <MessageSquareText className="size-4 text-cyan" />
                Plantillas de mensajes
              </span>
            }
            description="Se usan al contactar un lead por WhatsApp o email."
          />
          <CardBody>
            <TemplatesManager templates={templates} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}
