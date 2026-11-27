import { notFound } from "next/navigation";
import { z } from "zod";
import { ProjectEditor } from "@/components/leads/crm/project-editor";
import { ProjectDate, progressLabel } from "@/components/leads/crm/project-list";
import { TaskBoard } from "@/components/leads/crm/task-board";
import { ButtonLink } from "@/components/ui/button";
import { HeaderBar, PageHeading } from "@/components/ui/page-header";
import { argentinaDay } from "@/lib/crm/model";
import { projectStatusLabels } from "@/lib/crm/projects/model";
import { getProject, listProjectOptions } from "@/lib/crm/projects/queries";
import { getAvailableTaskContexts, getTaskPeople, listTasks } from "@/lib/crm/queries";

export const metadata = { title: "Detalle del proyecto" };

export default async function ProjectPage({ params }: PageProps<"/leads/proyectos/[id]">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { ready, project } = await getProject(id);
  if (!ready) return <p className="p-6 text-sm text-lm-ink-2">Proyectos requiere la migración de este entorno.</p>;
  if (!project) notFound();
  const [assignment, contexts, projects, { tasks }] = await Promise.all([
    getTaskPeople(), getAvailableTaskContexts(), listProjectOptions(), listTasks("project", id),
  ]);
  const clients = contexts.filter((item) => item.kind === "client").map(({ id, label }) => ({ value: id, label }));
  const owners = project.assigneeIds.map((member) => assignment.people.find((person) => person.id === member)?.label ?? "Fuera del equipo").join(", ");

  return (
    <>
      <HeaderBar breadcrumb="Gestor de Leads / Proyectos / Detalle" />
      <div className="mx-auto grid w-full max-w-5xl gap-6 px-4 py-7 sm:px-6 lg:px-8">
        <ButtonLink className="w-fit" href="/leads/proyectos" variant="ghost">Volver a Proyectos</ButtonLink>
        <PageHeading title={project.name} description={projectStatusLabels[project.status]} action={
          <ProjectEditor project={project} people={assignment.people} clients={clients} hasTasks={tasks.length > 0} />
        } />
        <section aria-label="Datos del proyecto" className="rounded-lm-lg border border-lm-line p-4">
          <dl className="grid gap-4 text-sm wrap-anywhere text-lm-ink sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-xs text-lm-ink-2">Cliente</dt><dd><ButtonLink variant="ghost" className="mt-1" href={`/leads/clientes/${project.client_id}`}>{project.clientName}</ButtonLink></dd></div>
            <div><dt className="text-xs text-lm-ink-2">Responsables</dt><dd className="mt-1">{owners || "Sin responsable"}</dd></div>
            <div><dt className="text-xs text-lm-ink-2">Inicio</dt><dd className="mt-1"><ProjectDate value={project.starts_on} /></dd></div>
            <div><dt className="text-xs text-lm-ink-2">Entrega</dt><dd className="mt-1"><ProjectDate value={project.due_on} /></dd></div>
          </dl>
        </section>
        <section className="grid gap-3" aria-labelledby="project-stages">
          <h2 id="project-stages" className="font-semibold text-lm-ink">Etapas</h2>
          {project.stages.length ? (
            <ol className="flex flex-wrap gap-2">
              {project.stages.map((stage, index) => {
                const current = stage.id === project.current_stage_id;
                return <li key={stage.id} aria-current={current ? "step" : undefined}
                  className={`min-w-0 rounded-lm-md border px-3 py-2 text-sm wrap-anywhere ${current ? "border-lm-signal bg-lm-signal-soft text-lm-signal-text" : "border-lm-line text-lm-ink-2"}`}>
                  {index + 1}. {stage.name}{current ? " · Actual" : ""}
                </li>;
              })}
            </ol>
          ) : <p className="text-sm text-lm-ink-2">Todavía no hay etapas.</p>}
        </section>
        <section className="grid min-w-0 gap-3" aria-labelledby="project-tasks">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="project-tasks" className="font-semibold text-lm-ink">Tareas <span className="ml-1 text-sm font-normal text-lm-ink-2">{progressLabel(tasks.filter((task) => task.status === "done").length, tasks.length)}</span></h2>
            <ButtonLink href={`/leads/seguimiento/tareas?vista=tablero&cliente=${project.client_id}&proyecto=${id}`}>Ver en el tablero</ButtonLink>
          </div>
          <TaskBoard tasks={tasks} {...assignment} contexts={contexts} projects={projects} today={argentinaDay()}
            fixedProject={{ id, clientId: project.client_id, label: project.name }} />
        </section>
      </div>
    </>
  );
}
