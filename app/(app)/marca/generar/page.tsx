import { KeyRound } from "lucide-react";

import { BrandChatPanel } from "@/components/brand/chat/chat-panel";
import { Crumbs } from "@/components/brand/ui/card";
import { ButtonLink } from "@/components/leads/ui/button";
import { EmptyState } from "@/components/leads/ui/feedback";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { getBrandChatMessages, getBrandChatThreads } from "@/lib/brand/queries";
import { getGeminiKeyStatus } from "@/lib/settings/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Generar contenido · Awareness AI" };
// El turno completo (varias vueltas de herramientas + búsqueda web a veces)
// corre en un after() de la Server Action — mismo límite que analisis/page.tsx.
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;

export default async function GenerarPage({ searchParams }: { searchParams: Promise<{ hilo?: string }> }) {
  const user = await requireUser();
  const geminiKey = await getGeminiKeyStatus();

  if (!geminiKey.configured) {
    return (
      <>
        <HeaderBar breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Generar contenido" }]} />} />
        <div className="flex flex-col gap-8 px-6 py-7 lg:px-8">
          <PageHeading title="Generar contenido" description="Ideas, guiones, captions y hashtags." />
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title="Falta la API key de Gemini"
            description="Cargala en Configuración para poder charlar con el asistente de contenido."
            action={
              <ButtonLink href="/configuracion" variant="primary">
                Ir a Configuración
              </ButtonLink>
            }
          />
        </div>
      </>
    );
  }

  const { hilo } = await searchParams;
  const threads = await getBrandChatThreads(PLATFORM);
  // `?hilo=` abre esa conversación (así F5 no salta a otra); sin él, o con un id que no es de este usuario, la última.
  const thread = (hilo ? threads.find((t) => t.id === hilo) : null) ?? threads[0] ?? null;
  const messages = thread ? await getBrandChatMessages(thread.id) : [];

  // Sin PageHeader ni padding: el chat ocupa todo el alto y ancho del área principal.
  return (
    <BrandChatPanel
      platform={PLATFORM}
      ownerId={user.id}
      initialThreads={threads}
      initialThread={thread}
      initialMessages={messages}
    />
  );
}
