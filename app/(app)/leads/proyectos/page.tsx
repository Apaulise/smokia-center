import { CrmPicker } from "@/components/leads/crm/picker";
import { ProjectEditor } from "@/components/leads/crm/project-editor";
import { ProjectList } from "@/components/leads/crm/project-list";
import { actionSize } from "@/components/leads/crm/styles";
import { Button, ButtonLink } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { matchesAssignee } from "@/lib/crm/model";
import { projectStatuses, projectStatusLabels } from "@/lib/crm/projects/model";
import { listProjects } from "@/lib/crm/projects/queries";
import { getTaskPeople, listClients } from "@/lib/crm/queries";

export const metadata = { title: "Proyectos · SmokIA" };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function ProjectsPage({ searchParams }: PageProps<"/leads/proyectos">) {
  const [{ ready, projects }, { clients }, { people, userId }, params] = await Promise.all([
    listProjects(), listClients(), getTaskPeople(), searchParams,
  ]);
  const company = clients.find((client) => client.id === first(params.cliente));
  const status = projectStatuses.find((item) => item === first(params.estado)) ?? "";
  const person = first(params.responsable);
  const assignee = person === "sin-responsable" ? person : people.find(({ id }) => id === person)?.id ?? "";
  const clientOptions = clients.map((client) => ({ value: client.id, label: client.name }));
  const filtered = projects.filter((project) => (!company || project.client_id === company.id)
    && (!status || project.status === status) && matchesAssignee(project.assigneeIds, assignee));

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Proyectos" />
      <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-7 sm:px-6 lg:px-8">
        <PageHeading title="Proyectos" description="Gestioná las entregas, etapas y tareas de cada cliente."
          action={ready && clients.length ? <ProjectEditor people={people} clients={clientOptions} clientId={company?.id} /> : undefined} />
        {!ready ? <p role="status" className="text-sm text-lm-ink-2">Proyectos requiere la migración de este entorno.</p> : !clients.length ? (
          <div className="grid justify-items-start gap-3 rounded-lm-md border border-dashed border-lm-line p-4">
            <p className="text-sm text-lm-ink-2">Creá un cliente para registrar su primer proyecto.</p>
            <ButtonLink href="/leads/clientes" className={actionSize}>Ir a Clientes</ButtonLink>
          </div>
        ) : (
          <>
            <search aria-label="Filtros de proyectos">
              <form key={`${company?.id ?? ""}/${status}/${assignee}`} action="/leads/proyectos" className="flex flex-wrap items-end gap-3">
                <Field label="Cliente" htmlFor="projects-client">
                  <CrmPicker id="projects-client" label="Cliente" name="cliente" initial={company?.id ?? ""}
                    options={[{ value: "", label: "Todos" }, ...clientOptions]} />
                </Field>
                <Field label="Estado" htmlFor="projects-status">
                  <CrmPicker id="projects-status" label="Estado" name="estado" initial={status}
                    options={[{ value: "", label: "Todos" }, ...projectStatuses.map((value) => ({ value, label: projectStatusLabels[value] }))]} />
                </Field>
                <Field label="Responsable" htmlFor="projects-person">
                  <CrmPicker id="projects-person" label="Responsable" name="responsable" initial={assignee}
                    options={[{ value: "", label: "Todos" }, { value: "sin-responsable", label: "Sin responsable" },
                      ...people.map(({ id, label }) => ({ value: id, label: id === userId ? "Mis proyectos" : label }))]} />
                </Field>
                <Button className={actionSize} type="submit">Filtrar</Button>
                {company || status || assignee ? <ButtonLink href="/leads/proyectos" variant="ghost" className={actionSize}>Limpiar</ButtonLink> : null}
              </form>
            </search>
            <ProjectList projects={filtered} people={people} empty={projects.length ? "No hay proyectos con estos filtros." : "Todavía no hay proyectos."} />
          </>
        )}
      </div>
    </>
  );
}
