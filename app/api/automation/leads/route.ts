// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// GET /api/automation/leads — la cola de leads para contactar, del owner de
// AUTOMATION_OWNER_ID. Filtros: status (lista separada por comas, default
// NUEVO,LISTO), industry (UUID o nombre del rubro), list, city,
// uncontacted, has_phone (default true), limit (default 25, máx. 100).
// Cada lead incluye `email` (string o null). Este GET no escribe nada.
//
// POST /api/automation/leads — crea un lead en NUEVO. Body: { agent?, name,
// city?, website?, email?, phone?, notes?, list? | lista? }. El agente va en
// `agent` o en el header `X-Agent`. El teléfono se normaliza como el PATCH.
// Si ya hay un lead con ese teléfono, email, sitio o nombre+ciudad, responde
// 409 con el id existente y no escribe. Deja una actividad NOTA.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { createAgentsFromEnv, decideWriteAgent } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { createLeadBodySchema, createLeadForAutomation, toCreateLeadInput } from "@/lib/automation/create-lead";
import { listLeadsForAutomation, listLeadsQuerySchema } from "@/lib/automation/leads";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const parsed = listLeadsQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return automationError(400, "Parámetros inválidos.", parsed.error.issues);

  const result = await listLeadsForAutomation(createAdminClient(), auth.ownerId, parsed.data);
  return NextResponse.json({ ...result, count: result.leads.length });
}

export async function POST(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const json = await request.json().catch(() => null);
  const parsed = createLeadBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const agent = decideWriteAgent({
    bodyAgent: parsed.data.agent,
    headerAgent: request.headers.get("x-agent"),
    allowed: createAgentsFromEnv(process.env),
    deniedMessage: "Este agente no puede crear leads.",
  });
  if (!agent.ok) return automationError(agent.status, agent.error);

  const result = await createLeadForAutomation(
    createAdminClient(),
    auth.ownerId,
    agent.agent,
    toCreateLeadInput(parsed.data),
  );
  if (!result.ok) {
    if (result.reason === "conflict") {
      return NextResponse.json(
        result.id ? { error: result.message, id: result.id } : { error: result.message },
        { status: 409 },
      );
    }
    const status = result.reason === "error" ? 500 : 400;
    return automationError(status, result.message);
  }

  revalidatePath("/leads/lista");
  revalidatePath("/leads");
  revalidatePath("/leads/seguimiento");
  revalidatePath(`/leads/${result.lead.id}`);

  return NextResponse.json({ lead: result.lead, agent: result.agent, activity: result.activity }, { status: 201 });
}
