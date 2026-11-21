import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { taskDate, type PersonOption } from "@/lib/crm/model";
import { projectStatusLabels, type ProjectSummary } from "@/lib/crm/projects/model";

export function ProjectList({ projects, people, showClient = true, empty }: {
  projects: ProjectSummary[];
  people: PersonOption[];
  showClient?: boolean;
  empty: string;
}) {
  if (!projects.length) return <p className="rounded-lm-md border border-dashed border-lm-line p-4 text-sm text-lm-ink-2">{empty}</p>;
  const peopleById = new Map(people.map((person) => [person.id, person.label]));
  return (
    <ul className="divide-y divide-lm-line overflow-hidden rounded-lm-lg border border-lm-line">
      {projects.map((project) => {
        const stage = project.stages.find((item) => item.id === project.current_stage_id);
        const owners = project.assigneeIds.map((id) => peopleById.get(id) ?? "Fuera del equipo").join(", ");
        return (
          <li key={project.id} className="grid min-w-0 gap-3 p-3 sm:p-4">
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <Link className="inline-flex min-w-0 items-center gap-2 rounded font-semibold wrap-anywhere text-lm-ink hover:underline focus-visible:lm-focus"
                href={`/leads/proyectos/${project.id}`}>
                {project.name}<ArrowUpRight size={15} className="shrink-0 text-lm-ink-2" aria-hidden />
              </Link>
              <span className="rounded-full bg-lm-ink/7 px-2.5 py-1 text-xs font-medium text-lm-ink">{projectStatusLabels[project.status]}</span>
            </div>
            <dl className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-3 text-sm wrap-anywhere text-lm-ink">
              {showClient ? <div><dt className="text-xs text-lm-ink-2">Cliente</dt><dd><Link className="text-lm-signal-text hover:underline focus-visible:lm-focus"
                href={`/leads/clientes/${project.client_id}`}>{project.clientName}</Link></dd></div> : null}
              <div><dt className="text-xs text-lm-ink-2">Etapa actual</dt><dd>{stage?.name ?? "Sin etapa"}</dd></div>
              <div><dt className="text-xs text-lm-ink-2">Responsables</dt><dd>{owners || "Sin responsable"}</dd></div>
              <div><dt className="text-xs text-lm-ink-2">Inicio</dt><dd><ProjectDate value={project.starts_on} /></dd></div>
              <div><dt className="text-xs text-lm-ink-2">Entrega</dt><dd><ProjectDate value={project.due_on} /></dd></div>
              <div><dt className="text-xs text-lm-ink-2">Tareas</dt><dd>{progressLabel(project.completed, project.total)}</dd></div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}

export function ProjectDate({ value }: { value: string | null }) {
  return value ? <time dateTime={value}>{taskDate(value)}</time> : <span>Sin fecha</span>;
}

export function progressLabel(completed: number, total: number) {
  return total ? `${completed} de ${total} completadas` : "Sin tareas";
}
