import { Bot, KeyRound, MessageSquareText, Sparkles, Tags, UserRound } from "lucide-react";

import { ActorOverridesForm } from "@/components/settings/actor-overrides-form";
import { AnthropicKeyForm } from "@/components/settings/anthropic-key-form";
import { ApifyKeyForm } from "@/components/settings/apify-key-form";
import { GeminiKeyForm } from "@/components/settings/gemini-key-form";
import { GroqKeyForm } from "@/components/settings/groq-key-form";
import { IndustriesManager } from "@/components/settings/industries-manager";
import { SalesProfileForm } from "@/components/settings/sales-profile-form";
import { TemplatesManager } from "@/components/settings/templates-manager";
import { WindsorKeyForm } from "@/components/settings/windsor-key-form";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Panel, Section } from "@/components/leads/ui/section";
import {
  getActorOverrides,
  getAnthropicKeyStatus,
  getApifyKeyStatus,
  getGeminiKeyStatus,
  getGroqKeyStatus,
  getSalesProfile,
  getWindsorKeyStatus,
  listIndustries,
  listMessageTemplates,
} from "@/lib/settings/queries";

export const metadata = { title: "Configuración · Awareness AI" };

export default async function ConfiguracionPage() {
  const [apifyStatus, windsorStatus, anthropicStatus, geminiStatus, groqStatus, salesProfile, industries, templates, actorOverrides] =
    await Promise.all([
      getApifyKeyStatus(),
      getWindsorKeyStatus(),
      getAnthropicKeyStatus(),
      getGeminiKeyStatus(),
      getGroqKeyStatus(),
      getSalesProfile(),
      listIndustries(),
      listMessageTemplates(),
      getActorOverrides(),
    ]);

  return (
    // bg-lm-bg propio: esta pantalla no cuelga de app/(app)/leads/layout.tsx (que ya
    // envuelve así sus rutas), así que sin esto el degradado de Marca se filtraría detrás.
    <div className="min-h-dvh bg-lm-bg font-lm-sans text-lm-ink">
      <HeaderBar breadcrumb="Configuración" />
      <div className="flex flex-col gap-8 px-6 py-8 lg:px-8">
        <PageHeading
          eyebrow="CONEXIONES Y PREFERENCIAS"
          title="Configuración"
          description="API keys de Apify, Windsor.ai, Groq, Google AI Studio y Anthropic, perfil del vendedor, rubros y plantillas de mensajes."
        />

        <Section
          eyebrow="Integraciones"
          title={
            <span className="flex items-center gap-2">
              <KeyRound className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Apify
            </span>
          }
          description="Necesaria para generar listas de leads desde Google Maps, Instagram y LinkedIn."
        >
          <Panel className="p-4">
            <ApifyKeyForm configured={apifyStatus.configured} masked={apifyStatus.masked} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <KeyRound className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Windsor.ai
            </span>
          }
          description="Métricas y publicación del Gestor de Marca Personal (Instagram por ahora)."
        >
          <Panel className="p-4">
            <WindsorKeyForm configured={windsorStatus.configured} masked={windsorStatus.masked} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Groq
            </span>
          }
          description="Free tier: lo que hoy decide (aperturas y análisis del copiloto de prospección, recomendaciones de contenido) — reemplaza a Anthropic en esas funciones."
        >
          <Panel className="p-4">
            <GroqKeyForm configured={groqStatus.configured} masked={groqStatus.masked} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Google AI Studio (Gemini)
            </span>
          }
          description="Free tier: enriquecimiento de leads, clasificación de competencia y lo que hoy transforma un texto que ya existe (reescrituras de tono, guiones, ideas desde un outlier) — sin ella fallan esas funciones, no sólo el filtro de competencia."
        >
          <Panel className="p-4">
            <GeminiKeyForm configured={geminiStatus.configured} masked={geminiStatus.masked} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Sparkles className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Anthropic
            </span>
          }
          description="Sólo el chat de Marca con herramientas (Etapa 2 de la migración, todavía sin hacer). El resto de Leads y Marca ya corre en Groq y Gemini."
        >
          <Panel className="p-4">
            <AnthropicKeyForm configured={anthropicStatus.configured} masked={anthropicStatus.masked} />
          </Panel>
        </Section>

        <Section
          eyebrow="Gestor de Leads"
          title={
            <span className="flex items-center gap-2">
              <UserRound className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Perfil del vendedor
            </span>
          }
          description="Lo único que el copiloto de prospección puede afirmar sobre tu experiencia. No va dentro del prompt canónico: se le manda en cada mensaje, así que se puede editar sin invalidar nada."
        >
          <Panel className="p-4">
            <SalesProfileForm profile={salesProfile} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Bot className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Actores de Apify
            </span>
          }
          description="Sobreescriben el actor por default de cada fuente. LinkedIn no tiene uno: hay que cargarlo antes de generar leads de ahí."
        >
          <Panel className="p-4">
            <ActorOverridesForm overrides={actorOverrides} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <Tags className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Rubros
            </span>
          }
          description="Categorizan cada lead. Se usan para filtrar la lista y medir qué combinación de rubro y zona cierra mejor."
        >
          <Panel className="p-4">
            <IndustriesManager industries={industries} />
          </Panel>
        </Section>

        <Section
          title={
            <span className="flex items-center gap-2">
              <MessageSquareText className="size-4 text-lm-ink-2" strokeWidth={1.5} />
              Plantillas de mensajes
            </span>
          }
          description="Se usan al contactar un lead por WhatsApp o email."
        >
          <Panel className="p-4">
            <TemplatesManager templates={templates} />
          </Panel>
        </Section>
      </div>
    </div>
  );
}
