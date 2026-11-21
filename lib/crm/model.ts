import type { Enums, Tables } from "@/lib/supabase/database.types";

export const clientStatuses = ["onboarding", "active", "paused"] as const;
export type ClientStatus = Enums<"crm_client_status">;
export const clientStatusLabels: Record<ClientStatus, string> = {
  onboarding: "En onboarding",
  active: "Activo",
  paused: "Pausado",
};

export const priorities = ["high", "normal", "low"] as const;
export type Priority = Enums<"crm_task_priority">;
export const priorityLabels: Record<Priority, string> = { high: "Alta", normal: "Normal", low: "Baja" };
export const columnColors = ["gray", "amber", "green", "blue", "purple", "rose"] as const;
export type ColumnColor = (typeof columnColors)[number];
export const columnColorLabels: Record<ColumnColor, string> = {
  gray: "Gris", amber: "Ámbar", green: "Verde", blue: "Azul", purple: "Violeta", rose: "Rosa",
};
export const defaultColumnColors: Record<TaskStatus, ColumnColor> = { pending: "gray", in_progress: "blue", done: "green" };

export const taskStatuses = ["pending", "in_progress", "done"] as const;
export type TaskStatus = Enums<"crm_task_status">;
export const taskStatusLabels: Record<TaskStatus, string> = {
  pending: "Pendientes",
  in_progress: "En curso",
  done: "Completadas",
};

export const contextColumns = { lead: "lead_id", client: "client_id", chat: "conversation_id" } as const;
export type ContextKind = keyof typeof contextColumns;
export type TaskContext = { kind: ContextKind; id: string; label: string };
export type PersonOption = { id: string; label: string };
export type ProjectOption = { id: string; label: string; clientId: string };

export type Client = Tables<"crm_clients">;
export type Contact = Tables<"crm_client_contacts">;
export type Task = Tables<"crm_tasks"> & { assigneeIds: string[] };

export function matchesAssignee(assigneeIds: string[], filter: string) {
  if (!filter) return true;
  return filter === "sin-responsable" ? assigneeIds.length === 0 : assigneeIds.includes(filter);
}

export function argentinaDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (key: string) => parts.find((part) => part.type === key)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export const taskGroups = {
  overdue: "Vencidas",
  today: "Para hoy",
  upcoming: "Próximas",
  undated: "Sin fecha",
  done: "Completadas",
} as const;
export type TaskGroup = keyof typeof taskGroups;

export function taskGroup(task: Pick<Task, "due_date" | "completed_at">, today: string): TaskGroup {
  if (task.completed_at) return "done";
  if (!task.due_date) return "undated";
  if (task.due_date < today) return "overdue";
  return task.due_date === today ? "today" : "upcoming";
}

export function crmDashboardSummary(
  clients: Pick<Client, "status">[],
  tasks: Pick<Task, "assigneeIds" | "client_id" | "due_date" | "completed_at">[],
  userId: string,
  today: string,
) {
  const clientsDue = new Set<string>();
  let tasksToday = 0;
  let overdue = 0;
  for (const task of tasks) {
    const group = taskGroup(task, today);
    if (group !== "today" && group !== "overdue") continue;
    if (task.client_id) clientsDue.add(task.client_id);
    if (!task.assigneeIds.includes(userId)) continue;
    if (group === "today") tasksToday++;
    else overdue++;
  }
  return { tasksToday, overdue, clientsDue: clientsDue.size, active: clients.filter((client) => client.status === "active").length };
}

export function taskDate(date: string) {
  return new Intl.DateTimeFormat("es-AR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`));
}

export function contextHref(kind: ContextKind, id: string) {
  if (kind === "chat") return `/leads/chats?c=${id}`;
  return kind === "client" ? `/leads/clientes/${id}` : `/leads/${id}`;
}
