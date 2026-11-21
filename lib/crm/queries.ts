import { cache } from "react";
import { asChats } from "@/lib/chats/db";
import { missingCrm, readCrmPages } from "@/lib/crm/db";
import { columnColors, contextColumns, type ColumnColor, type ContextKind, type Task, type TaskContext } from "@/lib/crm/model";
import { getTeamDirectory } from "@/lib/leads/team/queries";
import { createClient, requireUser } from "@/lib/supabase/server";

type FilterContext = Pick<TaskContext, "kind" | "id">;
const CLIENT_COLUMNS = "id,owner_id,assignee_id,source_lead_id,name,status,notes,created_at";
const TASK_COLUMNS = "*,crm_task_assignees(user_id)";

export const getTaskPeople = cache(async () => {
  const [user, team] = await Promise.all([requireUser(), getTeamDirectory()]);
  return {
    userId: user.id,
    people: [
      { id: user.id, label: "Vos" },
      ...team.filter((person) => person.ownerId !== user.id).map((person) => ({ id: person.ownerId, label: person.name })),
    ],
  };
});

export const listClients = cache(async () => {
  const db = await createClient();
  const [clients, contacts] = await Promise.all([
    readCrmPages((from, to) => db.from("crm_clients").select(CLIENT_COLUMNS).order("name").order("id").range(from, to)),
    readCrmPages((from, to) => db.from("crm_client_contacts").select("*").order("name").order("id").range(from, to)),
  ]);
  const error = clients.error ?? contacts.error;
  if (error && !missingCrm(error)) throw new Error("No se pudieron cargar los clientes.");
  return { ready: !error, clients: clients.data ?? [], contacts: contacts.data ?? [] };
});

export async function getClient(id: string) {
  const db = await createClient();
  const [client, contacts] = await Promise.all([
    db.from("crm_clients").select(CLIENT_COLUMNS).eq("id", id).maybeSingle(),
    readCrmPages((from, to) => db.from("crm_client_contacts").select("*").eq("client_id", id).order("name").order("id").range(from, to)),
  ]);
  const error = client.error ?? contacts.error;
  if (error && !missingCrm(error)) throw new Error("No se pudo cargar la ficha.");
  return { ready: !error, client: client.data, contacts: contacts.data ?? [] };
}

export async function getClientForLead(id: string) {
  const { data, error } = await (await createClient()).from("crm_clients")
    .select("id,assignee_id").eq("source_lead_id", id).maybeSingle();
  if (error && !missingCrm(error)) throw new Error("No se pudo consultar el vínculo con Clientes.");
  return { ready: !error, client: data };
}

export const listTasks = cache(async (kind?: ContextKind | "project", id?: string) => {
  const db = await createClient();
  const { data, error } = await readCrmPages((from, to) => {
    const query = db.from("crm_tasks").select(TASK_COLUMNS);
    if (kind && id) query.eq(kind === "project" ? "project_id" : contextColumns[kind], id);
    return query.order("created_at", { ascending: false }).order("id").range(from, to);
  });
  if (error && !missingCrm(error)) throw new Error("No se pudieron cargar las tareas.");
  return {
    ready: !error,
    tasks: data.map(({ crm_task_assignees, ...task }): Task => ({
      ...task,
      assigneeIds: crm_task_assignees.map(({ user_id }) => user_id),
    })),
  };
});

export const getBoardSettings = cache(async () => {
  const [user, db] = await Promise.all([requireUser(), createClient()]);
  const colors: Partial<Record<Task["status"], ColumnColor>> = {};
  const { data: member, error: memberError } = await db.from("team_members").select("team_id").eq("owner_id", user.id).maybeSingle();
  if (memberError) throw new Error("No se pudo consultar el equipo.");
  if (!member) return { teamId: null, colors };
  const { data, error } = await db.from("crm_board_colors").select("status,color").eq("team_id", member.team_id);
  if (error && !missingCrm(error)) throw new Error("No se pudieron cargar los colores del tablero.");
  for (const { status, color } of data ?? []) {
    const paletteColor = columnColors.find((option) => option === color);
    if (paletteColor) colors[status] = paletteColor;
  }
  return { teamId: member.team_id, colors };
});

export async function taskContexts(tasks: Task[], extra?: FilterContext) {
  const base = await createClient();
  const ids = (kind: ContextKind) => [...new Set([
    ...tasks.map((task) => task[contextColumns[kind]]).filter((id): id is string => Boolean(id)),
    ...(extra?.kind === kind ? [extra.id] : []),
  ])];
  const [leads, clients, chats] = await Promise.all([
    ids("lead").length ? base.from("leads").select("id,name").in("id", ids("lead")) : null,
    ids("client").length ? base.from("crm_clients").select("id,name").in("id", ids("client")) : null,
    ids("chat").length ? asChats(base).from("conversations").select("id,participant_name,participant_handle").in("id", ids("chat")) : null,
  ]);
  return [
    ...(leads?.data ?? []).map(({ id, name }): TaskContext => ({ kind: "lead", id, label: name })),
    ...(clients?.data ?? []).map(({ id, name }): TaskContext => ({ kind: "client", id, label: name })),
    ...(chats?.data ?? []).map((chat): TaskContext => ({
      kind: "chat", id: chat.id, label: chat.participant_name || chat.participant_handle || "Conversación de Instagram",
    })),
  ];
}

export async function getAvailableTaskContexts() {
  const base = await createClient();
  const [leads, clients, chats] = await Promise.all([
    readCrmPages((from, to) => base.from("leads").select("id,name").order("name").order("id").range(from, to)),
    readCrmPages((from, to) => base.from("crm_clients").select("id,name").order("name").order("id").range(from, to)),
    readCrmPages((from, to) => asChats(base).from("conversations").select("id,participant_name,participant_handle")
      .order("last_message_at", { ascending: false }).order("id").range(from, to)),
  ]);
  if (leads.error || clients.error || (chats.error && !missingCrm(chats.error))) {
    throw new Error("No se pudieron cargar los registros para vincular tareas.");
  }
  return [
    ...(leads.data ?? []).map(({ id, name }): TaskContext => ({ kind: "lead", id, label: name })),
    ...(clients.data ?? []).map(({ id, name }): TaskContext => ({ kind: "client", id, label: name })),
    ...(chats.data ?? []).map((chat): TaskContext => ({
      kind: "chat", id: chat.id, label: chat.participant_name || chat.participant_handle || "Conversación de Instagram",
    })),
  ];
}
