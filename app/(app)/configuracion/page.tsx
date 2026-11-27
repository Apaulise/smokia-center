import { Bot, KeyRound, Mail, MessageSquare, Sparkles, Tags, UserRound } from "lucide-react";

import { ActorOverridesForm } from "@/components/settings/actor-overrides-form";
import { ApifyKeyForm } from "@/components/settings/apify-key-form";
import { GeminiKeyForm } from "@/components/settings/gemini-key-form";
import { HuaweiMaasKeyForm } from "@/components/settings/huawei-maas-key-form";
import { IndustriesManager } from "@/components/settings/industries-manager";
import { SalesProfileForm } from "@/components/settings/sales-profile-form";
import { InstagramConnection } from "@/components/settings/instagram-connection";
import { ZernioConnection } from "@/components/settings/zernio-connection";
import { GmailConnection } from "@/components/settings/gmail-connection";
import { mailboxStatus } from "@/lib/mail/connection";
import { listChannelAccounts } from "@/lib/chats/queries";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { Panel, Section } from "@/components/ui/section";
import {
  getActorOverrides,
  getApifyKeyStatus,
  getGeminiKeyStatus,
  getHuaweiMaasKeyStatus,
  getSalesProfile,
  getInstagramConnectionStatus,
  listIndustries,
} from "@/lib/settings/queries";

export const metadata = { title: "Configuración" };

export default async function ConfiguracionPage({ searchParams }: { searchParams: Promise<{ gmail?: string }> }) {
  const [apifyStatus, geminiStatus, huaweiMaasStatus, salesProfile, industries, actorOverrides, instagramStatus, chatsStatus, gmailStatus, query] =
    await Promise.all([
      getApifyKeyStatus(),
      getGeminiKeyStatus(),
      getHuaweiMaasKeyStatus(),
      getSalesProfile(),
      listIndustries(),
      getActorOverrides(),
      getInstagramConnectionStatus(),
      listChannelAccounts(),
      mailboxStatus(),
      searchParams,
    ]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const webhookReachable = Boolean(appUrl) && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(appUrl);

  return (
    // Tipografía y color propios: esta pantalla no cuelga de app/(app)/leads/layout.tsx.
    <div className="lm-page-min font-lm-sans text-lm-ink">
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
                <MessageSquare className="size-4 text-lm-ink-2" strokeWidth={1.5} />
                Inbox de Instagram (Zernio)
              </span>
            }
            description="Los mensajes directos de Instagram entran por Zernio y aparecen en Chats, para vos y, si lo activás, para tu socio. La API key se guarda cifrada y ALTAB registra su propio webhook firmado."
          >
            <Panel className="p-4">
              <ZernioConnection
                ready={chatsStatus.ready}
                accounts={chatsStatus.accounts}
                hasTeam={chatsStatus.hasTeam}
                webhookReachable={webhookReachable}
              />
            </Panel>
          </Section>

          <div id="gmail" className="scroll-mt-16">
            <Section
              title={<span className="flex items-center gap-2"><Mail className="size-4 text-lm-ink-2" /> Correo de la empresa</span>}
              description="Conectá la cuenta de Gmail que querés usar en Correo. Podés compartirla con tu socio desde acá."
            >
              <Panel className="p-4"><GmailConnection status={gmailStatus} notice={query.gmail} /></Panel>
            </Section>
          </div>

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
                Huawei Cloud MaaS
              </span>
            }
            description="DeepSeek-V4.1-Flash-1017 en razonamiento high: aperturas, análisis y respuestas del copiloto, y recomendaciones de contenido."
          >
            <Panel className="p-4">
              <HuaweiMaasKeyForm configured={huaweiMaasStatus.configured} masked={huaweiMaasStatus.masked} />
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
