import { ArrowLeft, MapPin, Star } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { PageHeader } from "@/components/shell/page-header";
import { ContactActions } from "@/components/leads/contact-actions";
import { EnrichPanel } from "@/components/leads/enrich-panel";
import { LeadNotesForm } from "@/components/leads/lead-notes-form";
import { LeadTimeline } from "@/components/leads/lead-timeline";
import { ScheduleDialog } from "@/components/leads/schedule-dialog";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { EnrichmentResult } from "@/lib/leads/ai/enrich";
import { getLead, getLeadIntel, listLeadActivities, listUpcomingAppointmentsForLead } from "@/lib/leads/queries";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/leads/status";
import { listMessageTemplates } from "@/lib/settings/queries";

export async function generateMetadata({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const lead = await getLead(id);
  return { title: lead ? `${lead.name} · Awareness AI` : "Lead · Awareness AI" };
}

export default async function LeadFichaPage({ params }: PageProps<"/leads/[id]">) {
  const { id } = await params;
  const lead = await getLead(id);
  if (!lead) notFound();

  const [activities, appointments, templates, intel] = await Promise.all([
    listLeadActivities(id),
    listUpcomingAppointmentsForLead(id),
    listMessageTemplates(),
    getLeadIntel(id),
  ]);
  const enrichment = (intel?.enrichment as EnrichmentResult | null) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Leads"
        title={lead.name}
        description={[lead.address, lead.city, lead.region].filter(Boolean).join(", ") || undefined}
        action={
          <div className="flex items-center gap-3">
            <Badge tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</Badge>
            <ButtonLink
              href={lead.lead_lists ? `/leads/lista/${lead.lead_lists.id}` : "/leads/lista"}
              variant="ghost"
              size="sm"
            >
              <ArrowLeft className="size-3.5" />
              Volver a la lista
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-6 px-6 py-8 lg:grid-cols-3 lg:px-10">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader title="Datos de contacto" />
            <CardBody className="space-y-4">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {lead.phone ? <Field label="Teléfono" value={lead.phone} /> : null}
                {lead.email ? <Field label="Email" value={lead.email} /> : null}
                {lead.website ? <Field label="Sitio web" value={lead.website} /> : null}
                {lead.rating != null ? (
                  <Field
                    label="Rating"
                    value={
                      <span className="flex items-center gap-1">
                        <Star className="size-3.5 text-warning" />
                        {lead.rating} {lead.reviews_count ? `(${lead.reviews_count})` : ""}
                      </span>
                    }
                  />
                ) : null}
                {lead.address ? (
                  <Field
                    label="Dirección"
                    value={
                      <span className="flex items-start gap-1">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" />
                        {lead.address}
                      </span>
                    }
                  />
                ) : null}
              </dl>

              <div className="border-t border-line/60 pt-4">
                <ContactActions lead={lead} templates={templates} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Enriquecimiento IA" description="Análisis comercial antes del primer contacto (SPA §4)." />
            <CardBody>
              <EnrichPanel leadId={lead.id} enrichment={enrichment} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Actividad" description="Historial completo, se registra solo." />
            <CardBody>
              <LeadTimeline activities={activities} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Rubro y origen" />
            <CardBody className="space-y-3 text-sm">
              <div>
                <p className="mb-1 text-xs text-muted">Rubro</p>
                {lead.industries ? (
                  <Badge color={lead.industries.color}>{lead.industries.name}</Badge>
                ) : (
                  <span className="text-muted">Sin asignar</span>
                )}
              </div>
              <div>
                <p className="mb-1 text-xs text-muted">Lista de origen</p>
                {lead.lead_lists ? (
                  <Link href={`/leads/lista/${lead.lead_lists.id}`} className="text-cyan hover:underline">
                    {lead.lead_lists.name}
                  </Link>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Agenda" />
            <CardBody>
              <ScheduleDialog leadId={lead.id} leadName={lead.name} upcoming={appointments} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Notas" description="Notas libres y próxima acción." />
            <CardBody>
              <LeadNotesForm leadId={lead.id} notes={lead.notes} nextActionAt={lead.next_action_at} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 text-ink">{value}</dd>
    </div>
  );
}
