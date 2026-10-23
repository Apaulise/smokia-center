// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/leads/:id — el lead con sus últimas 20 actividades y
// sus últimos 20 mensajes.
//
// PATCH /api/automation/leads/:id — { notes?, next_action_at? }. Actualiza la
// nota y/o la próxima acción que armó Ventas. No cambia status y no registra
// contacto ni actividad (a diferencia de POST .../contact y del formulario de
// la ficha, que sí deja una NOTA). Hace falta al menos uno de los dos campos.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { leadPlanningBodySchema, toLeadPlanningPatch } from "@/lib/automation/lead-planning";
import { getLeadForAutomation } from "@/lib/automation/leads";
import { updateLeadPlanning } from "@/lib/leads/contact";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const result = await getLeadForAutomation(createAdminClient(), auth.ownerId, id);
  if (!result) return automationError(404, "Lead no encontrado.");
  return NextResponse.json(result);
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const json = await request.json().catch(() => null);
  const parsed = leadPlanningBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const result = await updateLeadPlanning(createAdminClient(), auth.ownerId, id, toLeadPlanningPatch(parsed.data));
  if (!result.ok) {
    const status = result.reason === "not_found" ? 404 : result.reason === "empty" ? 400 : 500;
    return automationError(status, result.message);
  }

  revalidatePath(`/leads/${id}`);
  revalidatePath("/leads/lista");
  revalidatePath("/leads/seguimiento");
  revalidatePath("/leads");
  return NextResponse.json({
    id: result.id,
    notes: result.notes,
    nextActionAt: result.nextActionAt,
    status: result.status,
    updatedAt: result.updatedAt,
  });
}
