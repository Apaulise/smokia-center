// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/weekly-reports — publica el análisis de un área y una
// semana. Repetir el mismo par actualiza la fila y no la duplica. Un estado
// que ya no está pendiente no se pisa.
// GET — lee lo publicado, para que el agente vea las decisiones.
// Esta ruta no envía WhatsApp, mails ni ningún otro mensaje.

import { revalidatePath } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

import { decideWriteAgent } from "@/lib/automation/agents";
import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { publishWeeklyReport, readWeeklyReports } from "@/lib/automation/weekly";
import { createAdminClient } from "@/lib/supabase/admin";
import { canListAllWeekly, canPublishWeekly, weeklyPublishAgents } from "@/lib/weekly/access";
import { camelizeWeekly, weeklyListQuery, weeklyPublishPayload } from "@/lib/weekly/schema";
import { parseWeekStart } from "@/lib/weekly/weeks";

export async function POST(request: NextRequest) {
  const json = await request.json().catch(() => null);
  const parsed = weeklyPublishPayload.safeParse(camelizeWeekly(json));
  if (!parsed.success) return automationError(400, "Body inválido.", parsed.error.issues);

  const auth = authorizeAgent(request, parsed.data.agent);
  if (!auth.ok) return auth.response;
  if (!canPublishWeekly(auth.agent, parsed.data.area, process.env)) {
    return automationError(403, "Este agente no puede publicar el análisis de esa área.");
  }

  const admin = openAdmin();
  if (!admin.ok) return admin.response;

  const result = await publishWeeklyReport(admin.client, auth.ownerId, auth.agent, parsed.data);
  if (!result.ok) return automationError(result.status, result.error);

  revalidatePath("/operaciones/analisis");
  return NextResponse.json({
    id: result.id,
    area: result.area,
    week: result.week,
    unchanged: result.unchanged,
    preservedDecisions: result.preservedDecisions,
  });
}

export async function GET(request: NextRequest) {
  const params = Object.fromEntries(request.nextUrl.searchParams.entries());
  const parsed = weeklyListQuery.safeParse(params);
  if (!parsed.success) return automationError(400, "Consulta inválida.", parsed.error.issues);

  const auth = authorizeAgent(request, null);
  if (!auth.ok) return auth.response;

  const week = parsed.data.week ? parseWeekStart(parsed.data.week) : null;
  if (parsed.data.week && !week) {
    return automationError(400, "La semana tiene que ser un lunes (2026-10-26) o una semana ISO (2026-W44).");
  }
  if (parsed.data.area) {
    if (!canPublishWeekly(auth.agent, parsed.data.area, process.env)) {
      return automationError(403, "Este agente no puede leer el análisis de esa área.");
    }
  } else if (!canListAllWeekly(auth.agent, process.env)) {
    return automationError(400, "Indicá el área.");
  }

  const admin = openAdmin();
  if (!admin.ok) return admin.response;

  const result = await readWeeklyReports(admin.client, auth.ownerId, {
    area: parsed.data.area,
    week: week ?? undefined,
    limit: parsed.data.limit,
  });
  if (!result.ok) return automationError(result.status, result.error);
  if (week && result.reports.length === 0) {
    return automationError(404, "No hay un análisis de esa área en esa semana.");
  }
  return NextResponse.json({ count: result.reports.length, reports: result.reports });
}

function authorizeAgent(request: NextRequest, bodyAgent: string | null | undefined) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  const agent = decideWriteAgent({
    bodyAgent,
    headerAgent: request.headers.get("x-agent"),
    allowed: weeklyPublishAgents(process.env),
    deniedMessage: "Este agente no puede publicar el análisis semanal.",
  });
  if (!agent.ok) return { ok: false as const, response: automationError(agent.status, agent.error) };
  return { ok: true as const, ownerId: auth.ownerId, agent: agent.agent };
}

function openAdmin() {
  try {
    return { ok: true as const, client: createAdminClient() };
  } catch {
    return { ok: false as const, response: automationError(500, "El servidor no puede escribir en la base.") };
  }
}
