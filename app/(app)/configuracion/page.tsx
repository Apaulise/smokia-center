import { Bot, KeyRound, Sparkles, Tags, UserRound } from "lucide-react";

import { ActorOverridesForm } from "@/components/settings/actor-overrides-form";
import { ApifyKeyForm } from "@/components/settings/apify-key-form";
import { GeminiKeyForm } from "@/components/settings/gemini-key-form";
import { GroqKeyForm } from "@/components/settings/groq-key-form";
import { IndustriesManager } from "@/components/settings/industries-manager";
import { SalesProfileForm } from "@/components/settings/sales-profile-form";
import { InstagramConnection } from "@/components/settings/instagram-connection";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Panel, Section } from "@/components/leads/ui/section";
import {
  getActorOverrides,
  getApifyKeyStatus,
  getGeminiKeyStatus,
  getGroqKeyStatus,
  getSalesProfile,
  getInstagramConnectionStatus,
  listIndustries,
} from "@/lib/settings/queries";

export const metadata = { title: "Configuración · Awareness AI" };

export default async function ConfiguracionPage() {
  const [apifyStatus, geminiStatus, groqStatus, salesProfile, industries, actorOverrides, instagramStatus] =
    await Promise.all([
      getApifyKeyStatus(),
      getGeminiKeyStatus(),
      getGroqKeyStatus(),
      getSalesProfile(),
      listIndustries(),
      getActorOverrides(),
      getInstagramConnectionStatus(),
    ]);

  return (
    // bg-lm-bg propio: esta pantalla no cuelga de app/(app)/leads/layout.tsx (que ya
    // envuelve así sus rutas), así que sin esto el degradado de Marca se filtraría detrás.
    <div className="min-h-dvh bg-lm-bg font-lm-sans text-lm-ink">
      <HeaderBar breadcrumb="Configuración" />
      <div className="flex flex-col gap-10 px-6 py-8 lg:px-8">
        <PageHeading
          eyebrow="CONEXIONES Y PREFERENCIAS"
          title="Configuración"
          description="Todo lo compartido entre módulos: motores de IA, y las preferencias propias de cada gestor."
        />

        {/* ── Gestor de Leads ──────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 border-t border-lm-line pt-6">
          <p className="font-lm-sans text-xs font-semibold tracking-[0.14em] text-lm-signal-text uppercase">
            Gestor de Leads
          </p>

          <Section
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
        </div>

        {/* ── Gestor de Marca Personal ─────────────────────────────────── */}
        <div className="flex flex-col gap-6 border-t border-lm-line pt-6">
          <p className="font-lm-sans text-xs font-semibold tracking-[0.14em] text-lm-signal-text uppercase">
            Gestor de Marca Personal
          </p>

          <Section
            title={
              <span className="flex items-center gap-2">
                <KeyRound className="size-4 text-lm-ink-2" strokeWidth={1.5} />
                Instagram (Meta)
              </span>
            }
            description="Métricas y publicación de TU cuenta, por la API oficial de Meta. Cada usuario conecta la suya."
          >
            <Panel className="p-4">
              <InstagramConnection configured={instagramStatus.configured} masked={instagramStatus.masked} />
            </Panel>
          </Section>
        </div>

        {/* ── Motores de IA, compartidos entre módulos ─────────────────── */}
        <div className="flex flex-col gap-6 border-t border-lm-line pt-6">
          <p className="font-lm-sans text-xs font-semibold tracking-[0.14em] text-lm-signal-text uppercase">
            Motores de IA · compartidos entre Leads y Marca
          </p>

          <Section
            title={
              <span className="flex items-center gap-2">
                <Sparkles className="size-4 text-lm-ink-2" strokeWidth={1.5} />
                Groq
              </span>
            }
            description="Free tier: lo que hoy decide (aperturas y análisis del copiloto de prospección, recomendaciones de contenido)."
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
            description="Free tier: enriquecimiento de leads, clasificación de competencia y lo que hoy transforma un texto que ya existe (reescrituras de tono, guiones, ideas desde un outlier) y el chat de Generar contenido — sin ella fallan esas funciones, no sólo el filtro de competencia."
          >
            <Panel className="p-4">
              <GeminiKeyForm configured={geminiStatus.configured} masked={geminiStatus.masked} />
            </Panel>
          </Section>
        </div>
      </div>
    </div>
  );
}
