// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/admin — catálogo de la lista blanca. Pide agente admin
// (header X-Agent). No lee la base.

import { type NextRequest, NextResponse } from "next/server";

import { authorizeAdmin } from "@/lib/automation/admin-http";
import { adminCatalog } from "@/lib/automation/admin-schema";

export async function GET(request: NextRequest) {
  const auth = authorizeAdmin(request, null);
  if (!auth.ok) return auth.response;
  return NextResponse.json({ agent: auth.agent, resources: adminCatalog() });
}
