import Link from "next/link";
import { TaskBoard } from "@/components/leads/crm/task-board";
import { TabLink, Tabs } from "@/components/ui/tabs";
import { argentinaDay, crmDashboardSummary, type TaskContext } from "@/lib/crm/model";
import { getAvailableTaskContexts, getTaskPeople, listClients, listTasks } from "@/lib/crm/queries";
import { listProjectOptions } from "@/lib/crm/projects/queries";

export function FollowUpTabs({ active }: { active: "prospectos" | "tareas" }) {
  return (
    <Tabs aria-label="Vistas de seguimiento">
      <TabLink href="/leads/seguimiento" active={active === "prospectos"}>Prospectos</TabLink>
      <TabLink href="/leads/seguimiento/tareas" active={active === "tareas"}>Tareas</TabLink>
    </Tabs>
  );
}

export function CrmUnavailable() {
  return (
    <p role="status" className="max-w-prose rounded-lm-md border border-lm-line bg-lm-ink/5 p-4 text-sm text-lm-ink-2">
      Clientes y Tareas requieren la migración del CRM en la base de este entorno.
    </p>
  );
}

export async function ContextTasks({ context }: { context: TaskContext }) {
  const result = await listTasks(context.kind, context.id);
  if (!result.ready) return null;
  const [{ people, userId }, contexts, projects] = await Promise.all([getTaskPeople(), getAvailableTaskContexts(), listProjectOptions()]);
  return (
    <section className="grid gap-3">
      <h2 className="font-semibold text-lm-ink">Tareas</h2>
      <TaskBoard tasks={result.tasks} people={people} userId={userId} contexts={contexts} projects={projects} fixed={context} today={argentinaDay()} />
    </section>
  );
}

export async function CrmDashboard() {
  const [clients, result] = await Promise.all([listClients(), listTasks()]);
  if (!clients.ready || !result.ready) return null;
  const { userId } = await getTaskPeople();
  const { tasksToday, overdue, active, clientsDue } = crmDashboardSummary(clients.clients, result.tasks, userId, argentinaDay());
  return (
    <section aria-label="Resumen comercial" className="grid gap-3 sm:grid-cols-2">
      <Link href="/leads/seguimiento/tareas?responsable=yo" className="rounded-lm-lg border border-lm-line bg-lm-ink/3 p-4 transition-colors hover:bg-lm-ink/6 focus-visible:lm-focus">
        <h2 className="text-sm font-medium text-lm-ink">Mis tareas de hoy</h2>
        <p className="mt-2 text-xl font-semibold tabular-nums text-lm-ink">{tasksToday}</p>
        <p className={`mt-1 text-sm ${overdue ? "text-lm-danger" : "text-lm-ink-2"}`}>{overdue} {overdue === 1 ? "vencida" : "vencidas"}</p>
      </Link>
      <Link href="/leads/clientes" className="rounded-lm-lg border border-lm-line bg-lm-ink/3 p-4 transition-colors hover:bg-lm-ink/6 focus-visible:lm-focus">
        <h2 className="text-sm font-medium text-lm-ink">Clientes activos</h2>
        <p className="mt-2 text-xl font-semibold tabular-nums text-lm-ink">{active}</p>
        <p className="mt-1 text-sm text-lm-ink-2">{clientsDue} por atender</p>
      </Link>
    </section>
  );
}
