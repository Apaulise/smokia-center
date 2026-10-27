// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/admin.ts.
//
// GET  /api/automation/admin/:resource — lista del owner, columnas de la lista blanca.
// POST /api/automation/admin/:resource — alta. owner_id lo pone el servidor.

import { type NextRequest } from "next/server";

import { createAdminRow, listAdminRows } from "@/lib/automation/admin";
import { adminResponse, beginAdmin, revalidateCrm } from "@/lib/automation/admin-http";

export async function GET(request: NextRequest, ctx: { params: Promise<{ resource: string }> }) {
  const auth = beginAdmin(request, null, false);
  if (!auth.ok) return auth.response;
  const { resource } = await ctx.params;
  const result = await listAdminRows(
    auth.admin,
    auth.ownerId,
    resource,
    Object.fromEntries(request.nextUrl.searchParams.entries()),
  );
  return adminResponse(result);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ resource: string }> }) {
  const json = await request.json().catch(() => null);
  const auth = beginAdmin(request, json, true);
  if (!auth.ok) return auth.response;
  const { resource } = await ctx.params;
  const result = await createAdminRow(auth.admin, auth.ownerId, auth.agent, resource, json);
  if (result.ok) revalidateCrm(result.body);
  return adminResponse(result);
}
