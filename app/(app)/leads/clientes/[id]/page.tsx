import { notFound } from "next/navigation";
import { z } from "zod";
import { ClientEditor, ContactEditor } from "@/components/leads/crm/client-editor";
import { MeetingNotes } from "@/components/leads/crm/meeting-notes";
import { ProjectEditor } from "@/components/leads/crm/project-editor";
import { ProjectList } from "@/components/leads/crm/project-list";
import { ContextTasks, CrmUnavailable } from "@/components/leads/crm/sections";
import { ButtonLink } from "@/components/ui/button";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { listConversationsForLead } from "@/lib/chats/queries";
import { clientStatusLabels, contextHref } from "@/lib/crm/model";
import { getClient, getTaskPeople, listClients, taskContexts } from "@/lib/crm/queries";
import { listProjects } from "@/lib/crm/projects/queries";

export const metadata = { title: "Ficha de cliente" };

export default async function ClientPage({ params }: PageProps<"/leads/clientes/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { ready, client, contacts } = await getClient(id);
  if (!ready) return <div className="p-6"><CrmUnavailable /></div>;
  if (!client) notFound();
  const [{ people }, sources, projectResult, { clients }] = await Promise.all([
    getTaskPeople(),
    client.source_lead_id ? taskContexts([], { kind: "lead", id: client.source_lead_id }) : [],
    listProjects(id),
    listClients(),
  ]);
  const source = sources[0]?.id;
  const chats = source ? await listConversationsForLead(source) : [];
  const leadHref = source ? contextHref("lead", source) : null;
  const responsible = client.assigneeIds.map((id) =>
    people.find((person) => person.id === id)?.label ?? "Fuera del equipo").join(", ") || "Sin responsables";

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Clientes / Ficha" />
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-7 sm:px-6 lg:px-8">
        <ButtonLink className="w-fit" href="/leads/clientes" variant="ghost">Volver a Clientes</ButtonLink>
        <PageHeading title={client.name} description={clientStatusLabels[client.status]} action={<ClientEditor client={client} people={people} />} />
        {projectResult.ready ? (
          <section className="grid min-w-0 gap-3" aria-labelledby="client-projects">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="client-projects" className="font-semibold text-lm-ink">Proyectos</h2>
              <ProjectEditor people={people} clientId={id} clients={clients.map((company) => ({ value: company.id, label: company.name }))} />
            </div>
            <ProjectList projects={projectResult.projects} people={people} showClient={false} empty="Todavía no hay proyectos asociados a este cliente." />
          </section>
        ) : null}
        <MeetingNotes context={{ kind: "client", id }} />
        <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
          <div className="grid min-w-0 content-start gap-5">
            <section className="rounded-lm-lg border border-lm-line p-4">
              <h2 className="font-semibold text-lm-ink">Información comercial</h2>
              <dl className="mt-3 grid gap-3 text-sm text-lm-ink-2">
                <div><dt className="font-medium text-lm-ink">Responsables</dt><dd>{responsible}</dd></div>
                <div><dt className="font-medium text-lm-ink">Origen</dt><dd>{client.source_lead_id ? "Lead ganado" : "Alta manual"}</dd></div>
                <div><dt className="font-medium text-lm-ink">Notas</dt><dd className="whitespace-pre-wrap wrap-anywhere">{client.notes || "Sin notas"}</dd></div>
              </dl>
              {leadHref ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <ButtonLink href={`${leadHref}#actividad`}>Historial del lead</ButtonLink>
                  <ButtonLink href={`${leadHref}#reuniones`}>Reuniones</ButtonLink>
                  {chats.map((chat) => <ButtonLink key={chat.id} href={contextHref("chat", chat.id)}>Chat {chat.participant_handle ? `@${chat.participant_handle}` : "de Instagram"}</ButtonLink>)}
                </div>
              ) : null}
            </section>
            <section className="rounded-lm-lg border border-lm-line p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold text-lm-ink">Contactos</h2>
                <ContactEditor clientId={client.id} />
              </div>
              {contacts.length ? (
                <ul className="mt-3 divide-y divide-lm-line">
                  {contacts.map((contact) => (
                    <li key={contact.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                      <div className="min-w-0 text-sm wrap-anywhere text-lm-ink-2">
                        <p className="font-medium text-lm-ink">{contact.name}</p>
                        {contact.job_title ? <p>{contact.job_title}</p> : null}
                        {contact.email ? <p>{contact.email}</p> : null}
                        {contact.phone ? <p>{contact.phone}</p> : null}
                      </div>
                      <ContactEditor clientId={client.id} contact={contact} />
                    </li>
                  ))}
                </ul>
              ) : <p className="mt-3 text-sm text-lm-ink-2">Todavía no hay contactos en esta ficha.</p>}
            </section>
          </div>
          <ContextTasks context={{ kind: "client", id, label: client.name }} />
        </div>
      </div>
    </>
  );
}
