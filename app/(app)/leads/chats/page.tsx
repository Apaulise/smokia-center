import { AlertTriangle, Megaphone, MessageSquare } from "lucide-react";
import Link from "next/link";

import type { AutomationSummary } from "@/components/leads/chats/contact-panel";
import { InboxClient } from "@/components/leads/chats/inbox-client";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/feedback";
import { HeaderBar } from "@/components/ui/page-header";
import { asChats } from "@/lib/chats/db";
import { listQuickReplies } from "@/lib/chats/inbox-actions";
import { getConversationDetail, listChannelAccounts, listConversations, listTagLabels, type ConversationFilter } from "@/lib/chats/queries";
import { createClient, getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Chats · SmokIA" };

const FILTERS: ConversationFilter[] = ["todas", "sin_leer", "por_responder", "ventana", "seguimiento", "archivadas"];

function first(value: string | string[] | undefined): string | undefined {
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

/** Las piezas automatizadas, para mostrar en el panel de qué reel llegó cada persona. Vacío sin la migración. */
async function listAutomationSummaries(): Promise<AutomationSummary[]> {
  const { data, error } = await asChats(await createClient())
    .from("content_automations")
    .select("id, stage, keywords, permalink, resource_title")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) return [];
  return (data ?? []).map((row) => ({ id: row.id, stage: row.stage, keywords: row.keywords, permalink: row.permalink, resourceTitle: row.resource_title }));
}

/**
 * La bandeja de chats (§1.25, fluida desde §1.26): las conversaciones de
 * Instagram que entran por Zernio, el hilo y el panel del contacto. El
 * servidor arma el estado inicial (todo en paralelo) y desde ahí la bandeja es
 * una isla de cliente: elegir un chat, filtrar o enviar no vuelve a pedir la
 * página. El estado vive en la URL (`?c=` conversación, `?f=` filtro, `?q=`
 * búsqueda, `?t=` etiqueta), así que se puede enlazar a un chat puntual.
 */
export default async function ChatsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const requestedFilter = first(params.f);
  const filter: ConversationFilter = FILTERS.includes(requestedFilter as ConversationFilter) ? (requestedFilter as ConversationFilter) : "todas";
  const search = (first(params.q) ?? "").slice(0, 60);
  const tag = first(params.t)?.slice(0, 64) ?? null;
  const selectedId = first(params.c) ?? null;

  const [user, { ready, accounts }, list, detail, labels, quickReplies, automations] = await Promise.all([
    getCurrentUser(),
    listChannelAccounts(),
    listConversations(filter === "archivadas" ? "archivadas" : "activas"),
    selectedId ? getConversationDetail(selectedId) : Promise.resolve(null),
    listTagLabels(),
    listQuickReplies().catch(() => ({ ready: false, items: [] })),
    listAutomationSummaries(),
  ]);

  const brokenAccounts = accounts.filter((account) => account.status !== "ACTIVA");
  const ownsAccount = accounts.some((account) => account.isOwner);

  return (
    <>
      <HeaderBar
        breadcrumb="Gestor de Leads / Chats"
        meta={
          ownsAccount ? (
            <Link href="/leads/chats/automatizaciones" className="inline-flex items-center gap-1.5 font-lm-sans text-xs text-lm-ink-2 hover:text-lm-ink">
              <Megaphone className="size-3.5" strokeWidth={1.5} />
              Automatizaciones
            </Link>
          ) : null
        }
      />

      {!ready ? (
        <div className="px-6 py-8 lg:px-8">
          <EmptyState
            icon={<MessageSquare className="size-5" strokeWidth={1.5} />}
            title="Falta aplicar la migración del inbox"
            description="Corré `npm run db:push` y `npm run db:types` (migraciones 20261113120000 y 20261113130000) y recargá."
          />
        </div>
      ) : accounts.length === 0 ? (
        <div className="px-6 py-8 lg:px-8">
          <EmptyState
            icon={<MessageSquare className="size-5" strokeWidth={1.5} />}
            title="Todavía no conectaste Instagram"
            description="Conectá tu cuenta de Zernio en Configuración y los mensajes directos aparecen acá, para vos y para tu socio."
            action={
              <ButtonLink href="/configuracion" variant="primary">
                Ir a Configuración
              </ButtonLink>
            }
          />
        </div>
      ) : (
        <div className="flex h-[calc(100dvh-3.5rem-var(--lm-shell-y))] min-h-0 flex-col">
          {brokenAccounts.length > 0 ? (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-lm-line bg-lm-ink/5 px-6 py-2 text-[13px] text-lm-ink-2" role="status">
              <AlertTriangle className="size-4 shrink-0 text-lm-signal-text" strokeWidth={1.5} />
              {brokenAccounts.map((account) => `@${account.handle ?? "instagram"}`).join(", ")}: {brokenAccounts[0]?.status_detail ?? "la cuenta necesita reconectarse en Zernio"}.
              <Link href="/configuracion" className="text-lm-signal-text hover:underline">
                Ver en Configuración
              </Link>
            </p>
          ) : null}
          <InboxClient
            initial={list}
            initialDetail={detail}
            initialFilter={filter}
            initialSearch={search}
            initialTag={tag}
            initialSelectedId={selectedId}
            labels={labels}
            automations={automations}
            quickReplies={quickReplies}
            currentUserId={user?.id ?? ""}
          />
        </div>
      )}
    </>
  );
}
