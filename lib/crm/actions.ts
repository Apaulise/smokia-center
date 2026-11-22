"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { argentinaDay, clientStatuses, columnColors, priorities, taskStatuses, type ColumnColor, type TaskStatus } from "@/lib/crm/model";
import { getAvailableTaskContexts, getBoardSettings, getTaskPeople, listTasks, taskContexts } from "@/lib/crm/queries";
import { listProjectOptions } from "@/lib/crm/projects/queries";
import { createClient, requireUser } from "@/lib/supabase/server";

export type CrmResult = { ok: boolean; message: string };

const uuid = z.uuid();
const optionalId = z.union([uuid, z.literal("")]).transform((value) => value || null);
const label = z.string().trim().min(1, "Completá el nombre o el título.").max(160, "Usá hasta 160 caracteres.");
const note = (max: number) => z.string().trim().max(max).transform((value) => value || null);
const email = z.union([z.email("Revisá el correo."), z.literal("")]).transform((value) => value || null);
const fields = (form: FormData) => Object.fromEntries(form);
const invalid = (error: z.ZodError): CrmResult => ({ ok: false, message: error.issues[0]?.message ?? "Revisá los datos." });
const failed = (message: string): CrmResult => ({ ok: false, message });
const done = (message: string): CrmResult => ({ ok: true, message });

function refreshCrm() {
  revalidatePath("/leads", "layout");
}

const clientFields = z.object({ name: label, status: z.enum(clientStatuses), notes: note(5000), assignees: z.array(uuid) });
const readClientFields = (form: FormData) => ({ ...fields(form), assignees: form.getAll("assignees") });
const createClientFields = clientFields.extend({
  source: optionalId, contact: note(160), email, phone: note(80), job_title: note(120),
}).refine(({ contact, email, phone, job_title }) => Boolean(contact) || (!email && !phone && !job_title), {
  message: "Ingresá un nombre para guardar los datos del contacto.",
});

export async function createCrmClient(_previous: CrmResult | null, form: FormData): Promise<CrmResult> {
  await requireUser();
  const parsed = createClientFields.safeParse(readClientFields(form));
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  const { data, error } = await (await createClient()).rpc("crm_write_client", {
    p_id: null,
    p_name: input.name,
    p_status: input.status,
    p_source: input.source ?? undefined,
    p_notes: input.notes ?? undefined,
    p_contact_name: input.contact ?? undefined,
    p_email: input.email ?? undefined,
    p_phone: input.phone ?? undefined,
    p_assignees: input.assignees,
    p_job_title: input.job_title ?? undefined,
  });
  if (error?.message === "Responsable fuera del equipo") return failed("Elegí responsables de tu equipo.");
  if (error || !data) return failed("No se pudo crear el cliente. Si viene de un lead, revisá que siga ganado.");
  refreshCrm();
  redirect(`/leads/clientes/${data}`);
}

export async function saveCrmClient(id: string, _previous: CrmResult | null, form: FormData): Promise<CrmResult> {
  await requireUser();
  const parsed = clientFields.safeParse(readClientFields(form));
  if (!parsed.success) return invalid(parsed.error);
  if (!uuid.safeParse(id).success) return failed("El cliente no está disponible.");
  const { data, error } = await (await createClient()).rpc("crm_write_client", {
    p_id: id, p_name: parsed.data.name, p_status: parsed.data.status,
    p_notes: parsed.data.notes ?? undefined, p_assignees: parsed.data.assignees,
  });
  if (error?.message === "Responsable fuera del equipo") return failed("Elegí responsables de tu equipo.");
  if (error || !data) return failed("No se pudo guardar el cliente.");
  refreshCrm();
  return done("Cliente guardado.");
}

const contactFields = z.object({ id: optionalId, name: label, email, phone: note(80), job_title: note(120) });

export async function saveCrmContact(clientId: string, _previous: CrmResult | null, form: FormData): Promise<CrmResult> {
  await requireUser();
  if (!uuid.safeParse(clientId).success) return failed("El cliente no está disponible.");
  const parsed = contactFields.safeParse(fields(form));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...changes } = parsed.data;
  const table = (await createClient()).from("crm_client_contacts");
  const query = id
    ? table.update(changes).eq("id", id).eq("client_id", clientId)
    : table.insert({ ...changes, client_id: clientId });
  const { data, error } = await query.select("id").maybeSingle();
  if (error || !data) return failed("No se pudo guardar el contacto.");
  refreshCrm();
  return done("Contacto guardado.");
}

const contextField = z.union([
  z.literal("preserve"),
  z.literal("").transform(() => null),
  z.string().transform((value) => {
    const [kind, id] = value.split(":");
    return { kind, id };
  }).pipe(z.object({ kind: z.enum(["lead", "chat"]), id: uuid })),
]);
const taskFields = z.object({
  id: optionalId, title: label, description: note(3000), priority: z.enum(priorities),
  due: z.union([z.iso.date(), z.literal("")]).transform((value) => value || null),
  assignees: z.array(uuid), origin: contextField,
  client_id: optionalId.optional(), project_id: optionalId.optional(),
  edit_version: uuid.optional(),
});

export async function saveCrmTask(_previous: CrmResult | null, form: FormData): Promise<CrmResult> {
  const { people } = await getTaskPeople();
  const parsed = taskFields.safeParse({ ...fields(form), assignees: form.getAll("assignees") });
  if (!parsed.success) return invalid(parsed.error);
  const input = parsed.data;
  if (input.id && !input.edit_version) return failed("Volvé a abrir la tarea antes de guardarla.");
  if (input.assignees.some((id) => !people.some((person) => person.id === id))) {
    return failed("Elegí responsables de tu equipo.");
  }
  if (input.origin === "preserve" && !input.id) return failed("Revisá el registro vinculado.");
  if (input.origin && input.origin !== "preserve" && (await taskContexts([], input.origin)).length !== 1) {
    return failed("El registro vinculado ya no está disponible.");
  }
  const changes = {
    title: input.title, description: input.description, priority: input.priority, due_date: input.due,
    ...(input.edit_version ? { edit_version: input.edit_version } : {}),
    ...(input.client_id !== undefined ? { client_id: input.client_id } : {}),
    ...(input.project_id !== undefined ? { project_id: input.project_id } : {}),
    ...(input.origin === "preserve" ? {} : {
      lead_id: input.origin?.kind === "lead" ? input.origin.id : null,
      conversation_id: input.origin?.kind === "chat" ? input.origin.id : null,
    }),
  };
  const { data, error } = await (await createClient()).rpc("crm_save_task", {
    p_id: input.id, p_task: changes, p_assignees: input.assignees,
  });
  if (error?.code === "PT409") return failed("Alguien cambió esta tarea. Cerrá el formulario y actualizá la página para ver los cambios.");
  if (error || !data) return failed("No se pudo guardar la tarea. Revisá los responsables, el cliente y el proyecto.");
  refreshCrm();
  return done(input.id ? "Tarea guardada." : "Tarea creada.");
}

export async function saveBoardColor(status: TaskStatus, color: ColumnColor): Promise<CrmResult> {
  if (!z.enum(taskStatuses).safeParse(status).success || !z.enum(columnColors).safeParse(color).success) {
    return failed("Revisá el color de la columna.");
  }
  const { teamId } = await getBoardSettings();
  if (!teamId) return failed("Los colores compartidos requieren un equipo.");
  const { error } = await (await createClient()).from("crm_board_colors").upsert({ team_id: teamId, status, color });
  if (error) return failed("No se pudo guardar el color.");
  refreshCrm();
  return done("Color guardado.");
}

export async function moveCrmTask(id: string, status: TaskStatus): Promise<CrmResult> {
  await requireUser();
  if (!uuid.safeParse(id).success || !z.enum(taskStatuses).safeParse(status).success) return failed("La tarea no está disponible.");
  const { data, error } = await (await createClient()).rpc("crm_set_task_status", { p_id: id, p_status: status });
  if (error || !data) return failed("No se pudo actualizar la tarea.");
  refreshCrm();
  return done("Estado actualizado.");
}

export async function loadChatTasks(id: string) {
  await requireUser();
  if (!uuid.safeParse(id).success) return null;
  const [context] = await taskContexts([], { kind: "chat", id });
  if (!context) return null;
  const [result, contexts, projects] = await Promise.all([listTasks("chat", id), getAvailableTaskContexts(), listProjectOptions()]);
  if (!result.ready) return null;
  return { tasks: result.tasks, context, contexts, projects, today: argentinaDay(), ...(await getTaskPeople()) };
}
