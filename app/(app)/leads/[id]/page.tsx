import { Mail, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { ContactActions } from "@/components/leads/contact-actions";
import { MessageThread } from "@/components/leads/conversation/message-thread";
import { SignalsList } from "@/components/leads/copilot/signals-list";
import { StatusSummary } from "@/components/leads/copilot/status-summary";
import { EnrichPanel } from "@/components/leads/enrich-panel";
import { LeadComposer } from "@/components/leads/lead-composer";
import { LeadNav } from "@/components/leads/lead-nav";
import { LeadNotesForm } from "@/components/leads/lead-notes-form";
import { ScheduleDialog } from "@/components/leads/schedule-dialog";
import { StageSelect } from "@/components/leads/stage-select";
import { HeaderBar } from "@/components/leads/ui/page-header";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import type { LeadMemory } from "@/lib/leads/ai/prompts";
import {
  getLead,
  getLeadIntel,
  listLeadActivities,
  listLeadIdsForNav,
  listLeadMessages,
  listLeadSignals,
  listUpcomingAppointmentsForLead,
} from "@/lib/leads/queries";
import { formatAddress } from "@/lib/leads/address";
import { LEAD_STATUSES } from "@/lib/leads/status";

export async function generateMetadata({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const lead = await getLead(id);
  return { title: lead ? `${lead.name} · Awareness AI` : "Lead · Awareness AI" };
}

/**
 * La ficha del lead (Plan §1.15, Design System §07 "Detalle de lead"): tres
 * columnas — contacto/agenda/notas a la izquierda, composer contextual +
 * actividad al centro, Copilot a la derecha. `LeadComposer` consolida lo que
 * antes eran tres paneles separados (Apertura/Analizar/Seguimiento) en un
 * solo bloque que cambia según la etapa, como pide el mockup.
 */
export default async function LeadFichaPage({ params, searchParams }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const { modo } = await searchParams;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [activities, messages, signals, appointments, intel, navIds] = await Promise.all([
    listLeadActivities(id),
    listLeadMessages(id),
    listLeadSignals(id),
    listUpcomingAppointmentsForLead(id),
    getLeadIntel(id),
    lead.lead_lists ? listLeadIdsForNav(lead.lead_lists.id) : Promise.resolve([id]),
  ]);
  const enrichment = (intel?.enrichment as EnrichmentResult | null) ?? null;
  const memory = (intel?.memory as LeadMemory | null) ?? null;
  const stageIndex = LEAD_STATUSES.indexOf(lead.status) + 1;

  return (
    <>
      <HeaderBar
        breadcrumb={
          <span className="flex items-center gap-1.5 truncate">
            <Link href="/leads/lista" className="text-lm-ink-2 hover:text-lm-ink">
              Listas
            </Link>
            {lead.lead_lists ? (
              <>
                <span className="text-lm-ink-3">/</span>
                <Link href={`/leads/lista/${lead.lead_lists.id}`} className="text-lm-ink-2 hover:text-lm-ink">
                  {lead.lead_lists.name}
                </Link>
              </>
            ) : null}
            <span className="text-lm-ink-3">/</span>
            <span className="truncate text-lm-ink">{lead.name}</span>
          </span>
        }
        meta={<LeadNav ids={navIds} currentId={lead.id} />}
      />

      <div className="flex flex-col gap-4 border-b border-lm-line px-6 py-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-lm-sans text-[22px] leading-7 font-semibold tracking-[-0.01em] text-lm-ink">{lead.name}</h1>
          <StageSelect leadId={lead.id} status={lead.status} />
          <span className="font-mono text-xs text-lm-ink-3">
            etapa {stageIndex} de {LEAD_STATUSES.length}
          </span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex items-center gap-1.5 text-[13.5px] text-lm-ink-2">
            {lead.address || lead.city ? (
              <>
                <MapPin className="size-3.5 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
                {formatAddress(lead)}
              </>
            ) : null}
          </p>
          <ContactActions lead={lead} />
        </div>
      </div>

      <div className="grid gap-8 px-6 py-8 lg:grid-cols-[260px_minmax(0,1fr)_340px] lg:px-8">
        {/* Izquierda: contacto, rubro y origen, agenda, notas */}
        <div className="flex flex-col gap-6">
          <InfoSection eyebrow="Contacto">
            <dl className="flex flex-col gap-2.5 text-[13px]">
              {lead.phone ? <InfoRow label="Teléfono" value={<span className="font-mono">{lead.phone}</span>} /> : null}
              {lead.email ? (
                <InfoRow
                  label="Email"
                  value={
                    <span className="flex items-center gap-1.5">
                      <Mail className="size-3.5 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
                      {lead.email}
                    </span>
                  }
                />
              ) : null}
              {lead.website ? <InfoRow label="Sitio web" value={lead.website} /> : null}
              {lead.rating != null ? (
                <InfoRow
                  label="Rating"
                  value={
                    <span className="flex items-center gap-1">
                      <Star className="size-3.5 text-lm-signal" strokeWidth={1.5} />
                      {lead.rating} {lead.reviews_count ? `(${lead.reviews_count})` : ""}
                    </span>
                  }
                />
              ) : null}
            </dl>
          </InfoSection>

          <InfoSection eyebrow="Rubro y origen" divider>
            <div className="flex flex-col gap-3 text-[13px]">
              <div>
                <p className="mb-1 text-xs text-lm-ink-3">Rubro</p>
                {lead.industries ? (
                  <span className="inline-flex items-center gap-1.5" style={{ color: lead.industries.color ?? undefined }}>
                    {lead.industries.name}
                  </span>
                ) : (
                  <span className="text-lm-ink-3">Sin asignar</span>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-lm-ink-3">Lista de origen</p>
                {lead.lead_lists ? (
                  <Link href={`/leads/lista/${lead.lead_lists.id}`} className="text-lm-signal-text hover:underline">
                    {lead.lead_lists.name}
                  </Link>
                ) : (
                  <span className="text-lm-ink-3">—</span>
                )}
              </div>
            </div>
          </InfoSection>

          <InfoSection eyebrow="Agenda" divider>
            <ScheduleDialog leadId={lead.id} leadName={lead.name} upcoming={appointments} />
          </InfoSection>

          <InfoSection eyebrow="Notas" divider>
            <LeadNotesForm leadId={lead.id} nextActionAt={lead.next_action_at} />
          </InfoSection>
        </div>

        {/* Centro: composer contextual + actividad */}
        <div className="flex flex-col gap-6">
          <LeadComposer
            leadId={lead.id}
            status={lead.status}
            nextActionAt={lead.next_action_at}
            phone={lead.phone}
            hasInstagram={Boolean(lead.instagram_url)}
            messages={messages}
            nextBestActionReason={intel?.next_best_action_reason ?? null}
            preferFollowUp={modo === "seguimiento"}
          />
          <MessageThread messages={messages} activities={activities} />
        </div>

        {/* Derecha: Copilot */}
        <div className="flex flex-col gap-6">
          <InfoSection eyebrow="AI Copilot">
            <StatusSummary
              interestLevel={lead.interest_level}
              nextBestAction={intel?.next_best_action ?? null}
              nextBestActionReason={intel?.next_best_action_reason ?? null}
              memory={memory}
            />
          </InfoSection>

          <InfoSection eyebrow="Enriquecimiento" divider>
            <EnrichPanel leadId={lead.id} enrichment={enrichment} />
          </InfoSection>

          <InfoSection eyebrow="Dolores, objeciones y señales" divider>
            <SignalsList leadId={lead.id} signals={signals} />
          </InfoSection>
        </div>
      </div>
    </>
  );
}

/** Bloque sin card de la columna angosta: eyebrow + contenido, separado por línea (§ "líneas antes que cajas"). */
function InfoSection({ eyebrow, divider, children }: { eyebrow: string; divider?: boolean; children: ReactNode }) {
  return (
    <div className={divider ? "border-t border-lm-line pt-6" : undefined}>
      <p className="mb-3 font-lm-sans text-[11px] leading-[14px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
        {eyebrow}
      </p>
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-lm-ink-3">{label}</dt>
      <dd className="mt-0.5 text-lm-ink">{value}</dd>
    </div>
  );
}
