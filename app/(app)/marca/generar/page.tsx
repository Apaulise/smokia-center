import { KeyRound } from "lucide-react";

import { BrandChatPanel } from "@/components/brand/chat/chat-panel";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getBrandChatMessages, getLatestBrandChatThread } from "@/lib/brand/queries";
import { getAnthropicKeyStatus } from "@/lib/settings/queries";
import { requireUser } from "@/lib/supabase/server";

export const metadata = { title: "Generar contenido · Awareness AI" };
// El turno completo (varias vueltas de herramientas + búsqueda web a veces)
// corre en un after() de la Server Action — mismo límite que analisis/page.tsx.
export const maxDuration = 60;

const PLATFORM = "INSTAGRAM" as const;

export default async function GenerarPage() {
  const user = await requireUser();
  const anthropicKey = await getAnthropicKeyStatus();

  if (!anthropicKey.configured) {
    return (
      <>
        <PageHeader eyebrow="Gestor de Marca Personal" title="Generar contenido" description="Ideas, guiones, captions y hashtags." />
        <div className="px-6 lg:px-10">
          <EmptyState
            icon={<KeyRound className="size-5" />}
            title="Falta la API key de Anthropic"
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

  const thread = await getLatestBrandChatThread(PLATFORM);
  const messages = thread ? await getBrandChatMessages(thread.id) : [];

  return (
    <>
      <PageHeader eyebrow="Gestor de Marca Personal" title="Generar contenido" description="Ideas, guiones, captions y hashtags." />
      <div className="px-6 py-8 lg:px-10">
        <BrandChatPanel platform={PLATFORM} ownerId={user.id} initialThread={thread} initialMessages={messages} />
      </div>
    </>
  );
}
