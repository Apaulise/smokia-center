"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { CrmResult } from "@/lib/crm/actions";
import { projectStatuses } from "@/lib/crm/projects/model";
import { createClient, requireUser } from "@/lib/supabase/server";

const uuid = z.uuid();
const date = z.union([z.iso.date(), z.literal("")]).transform((value) => value || null);
const projectFields = z.object({
  name: z.string().trim().min(1, "Ingresá el nombre del proyecto.").max(160),
  client_id: uuid,
  status: z.enum(projectStatuses),
  starts_on: date,
  due_on: date,
  current_stage_id: z.union([uuid, z.literal("")]).transform((value) => value || null),
  edit_version: uuid.optional(),
  assignees: z.array(uuid),
  stages: z.array(z.object({ id: uuid, name: z.string().trim().min(1, "Completá el nombre de cada etapa.").max(120) })).max(30),
}).refine(({ starts_on, due_on }) => !starts_on || !due_on || starts_on <= due_on, {
  message: "La fecha de entrega tiene que ser igual o posterior al inicio.",
}).refine(({ stages, current_stage_id }) => !current_stage_id || stages.some((stage) => stage.id === current_stage_id), {
  message: "Elegí una etapa actual del proyecto.",
});

export async function saveCrmProject(id: string | null, _previous: CrmResult | null, form: FormData): Promise<CrmResult> {
  await requireUser();
  if (id && !uuid.safeParse(id).success) return { ok: false, message: "El proyecto no está disponible." };
  const stageIds = form.getAll("stage_id");
  const stageNames = form.getAll("stage_name");
  const input = projectFields.safeParse({
    ...Object.fromEntries(form), assignees: form.getAll("assignees"),
    stages: stageIds.map((stageId, index) => ({ id: stageId, name: stageNames[index] })),
  });
  if (!input.success) return { ok: false, message: input.error.issues[0]?.message ?? "Revisá los datos del proyecto." };
  const { stages, assignees, ...project } = input.data;
  if (id && !project.edit_version) return { ok: false, message: "Volvé a abrir el proyecto antes de guardarlo." };
  const { data, error } = await (await createClient()).rpc("crm_save_project", {
    p_id: id, p_project: project, p_stages: stages.map((stage, position) => ({ ...stage, position })), p_assignees: assignees,
  });
  if (error?.code === "PT409") {
    return { ok: false, message: "Alguien cambió este proyecto. Cerrá el formulario y actualizá la página para ver los cambios." };
  }
  if (error?.code === "23503") {
    return { ok: false, message: "Revisá la etapa y el cliente. Un proyecto con tareas asociadas no puede cambiar de cliente." };
  }
  if (error || !data) return { ok: false, message: "No se pudo guardar el proyecto. Revisá el cliente y los responsables." };
  revalidatePath("/leads", "layout");
  if (!id) redirect(`/leads/proyectos/${data}`);
  return { ok: true, message: "Proyecto guardado." };
}
