// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/leads/instagram — alta o actualización de un lead que
// respondió el embudo orgánico de Instagram (ManyChat). Body: { manychat_id?,
// ig_username?, name?, stage, rubro?, rubro_libre?, tarea?, tarea_libre?,
// tamano?, volumen?, keyword?, pieza_origen?, utm? }; hace falta al menos
// manychat_id o ig_username. El agente va en `agent` o en el header
// `X-Agent` y tiene que estar en AUTOMATION_INTAKE_AGENTS (default: manychat).
// Es un upsert: 201 si crea, 200 si actualiza (con `changed`). Nunca baja de
// estado a un lead que ya avanzó ni envía nada. Deja una actividad NOTA.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { decideWriteAgent, intakeAgentsFromEnv } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import {
  instagramIntakeBodySchema,
  toInstagramIntakeInput,
  upsertInstagramLead,
} from "@/lib/automation/instagram-intake";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const json = await request.json().catch(() => null);
  const parsed = instagramIntakeBodySchema.safeParse(json);
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const agent = decideWriteAgent({
    bodyAgent: parsed.data.agent,
    headerAgent: request.headers.get("x-agent"),
    allowed: intakeAgentsFromEnv(process.env),
    deniedMessage: "Este agente no puede cargar leads de Instagram.",
  });
  if (!agent.ok) return automationError(agent.status, agent.error);

  const result = await upsertInstagramLead(
    createAdminClient(),
    auth.ownerId,
    agent.agent,
    toInstagramIntakeInput(parsed.data),
  );
  if (!result.ok) return automationError(500, result.message);

  revalidatePath("/leads/lista");
  revalidatePath("/leads");
  revalidatePath("/leads/seguimiento");
  revalidatePath(`/leads/${result.lead.id}`);

  return NextResponse.json(
    { lead: result.lead, agent: result.agent, changed: result.changed, activity: result.activity },
    { status: result.created ? 201 : 200 },
  );
}
