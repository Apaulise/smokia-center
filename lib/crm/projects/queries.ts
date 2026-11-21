import { cache } from "react";
import { missingCrm, readCrmPages } from "@/lib/crm/db";
import type { ProjectOption } from "@/lib/crm/model";
import { listTasks } from "@/lib/crm/queries";
import type { Project, ProjectSummary } from "@/lib/crm/projects/model";
import { createClient } from "@/lib/supabase/server";

const projectColumns = "*,crm_clients(name),crm_project_stages!crm_project_stages_project_id_fkey(id,name,position),crm_project_assignees(user_id)";

export const listProjectOptions = cache(async (): Promise<ProjectOption[]> => {
  const db = await createClient();
  const { data, error } = await readCrmPages((from, to) =>
    db.from("crm_projects").select("id,name,client_id").order("name").order("id").range(from, to));
  if (error && !missingCrm(error)) throw new Error("No se pudieron cargar las opciones de proyectos.");
  return data.map(({ id, name, client_id }) => ({ id, label: name, clientId: client_id }));
});

const readProjects = cache(async (field?: "client_id" | "id", id?: string) => {
  const db = await createClient();
  const { data, error } = await readCrmPages((from, to) => {
    const query = db.from("crm_projects").select(projectColumns);
    if (field && id) query.eq(field, id);
    return query.order("name").order("id").range(from, to);
  });
  if (error && !missingCrm(error)) throw new Error("No se pudieron cargar los proyectos.");
  const projects: Project[] = data.map(({ crm_clients, crm_project_stages, crm_project_assignees, ...project }) => ({
    ...project,
    clientName: crm_clients?.name ?? "Cliente",
    stages: crm_project_stages.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)),
    assigneeIds: crm_project_assignees.map(({ user_id }) => user_id),
  }));
  return { ready: !error, projects };
});

export const listProjects = cache(async (clientId?: string) => {
  const [results, { tasks }] = await Promise.all([readProjects(clientId ? "client_id" : undefined, clientId), listTasks(clientId ? "client" : undefined, clientId)]);
  const counts = new Map<string, { total: number; completed: number }>();
  for (const task of tasks) {
    if (!task.project_id) continue;
    const count = counts.get(task.project_id) ?? { total: 0, completed: 0 };
    count.total++;
    if (task.status === "done") count.completed++;
    counts.set(task.project_id, count);
  }
  const projects: ProjectSummary[] = results.projects.map((project) => ({
    ...project, ...(counts.get(project.id) ?? { total: 0, completed: 0 }),
  }));
  return { ...results, projects };
});

export const getProject = cache(async (id: string) => {
  const { ready, projects } = await readProjects("id", id);
  return { ready, project: projects[0] ?? null };
});
