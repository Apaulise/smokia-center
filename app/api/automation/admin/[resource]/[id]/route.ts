// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/admin.ts.
//
// GET    /api/automation/admin/:resource/:id
// PATCH  /api/automation/admin/:resource/:id
// DELETE /api/automation/admin/:resource/:id?confirm=true
// El DELETE de leads es soft (DESCARTADO). El resto borra la fila del owner.

import { type NextRequest } from "next/server";
import { z } from "zod";

import { deleteAdminRow, getAdminRow, updateAdminRow } from "@/lib/automation/admin";
import { adminResponse, beginAdmin, revalidateCrm } from "@/lib/automation/admin-http";
import { deletionConfirmed } from "@/lib/automation/admin-schema";
import { automationError } from "@/lib/automation/auth";

function validId(id: string) {
  return z.uuid().safeParse(id).success;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ resource: string; id: string }> }) {
  const auth = beginAdmin(request, null, false);
  if (!auth.ok) return auth.response;
  const { resource, id } = await ctx.params;
  if (!validId(id)) return automationError(400, "Id inválido.");
  return adminResponse(await getAdminRow(auth.admin, auth.ownerId, resource, id));
}

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ resource: string; id: string }> }) {
  const json = await request.json().catch(() => null);
  const auth = beginAdmin(request, json, true);
  if (!auth.ok) return auth.response;
  const { resource, id } = await ctx.params;
  if (!validId(id)) return automationError(400, "Id inválido.");
  const result = await updateAdminRow(auth.admin, auth.ownerId, auth.agent, resource, id, json);
  if (result.ok) revalidateCrm(result.body);
  return adminResponse(result);
}

export async function DELETE(request: NextRequest, ctx: { params: Promise<{ resource: string; id: string }> }) {
  const json = await request.json().catch(() => null);
  const auth = beginAdmin(request, json, false);
  if (!auth.ok) return auth.response;
  const { resource, id } = await ctx.params;
  if (!validId(id)) return automationError(400, "Id inválido.");
  const result = await deleteAdminRow(
    auth.admin,
    auth.ownerId,
    auth.agent,
    resource,
    id,
    deletionConfirmed(request.nextUrl.searchParams.get("confirm"), json),
  );
  if (result.ok) revalidateCrm(result.body);
  return adminResponse(result);
}
