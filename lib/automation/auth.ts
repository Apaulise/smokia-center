// ⚠️ API de automatización — usa SERVICE ROLE (saltea RLS). Ver CLAUDE.md §4.
//
// La llama un tercero sin sesión (n8n, un script, un agente): se autentica
// con `Authorization: Bearer $AUTOMATION_API_SECRET`, mismo esquema que el
// CRON_SECRET de /api/jobs/*, pero con comparación de tiempo constante. Todo
// lo que hace queda atado a UN owner (`AUTOMATION_OWNER_ID`): el aislamiento
// entre usuarios depende de que cada query filtre por ese owner_id.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { safeEqual } from "@/lib/crypto";

export type AutomationAuth = { ok: true; ownerId: string } | { ok: false; response: NextResponse };

/** Por debajo de esto el secreto es adivinable; mejor fallar cerrado que aceptar uno corto por error de configuración. */
const MIN_SECRET_LENGTH = 32;

export function authorizeAutomation(request: NextRequest): AutomationAuth {
  const secret = process.env.AUTOMATION_API_SECRET ?? "";
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  // Falla cerrado: sin secreto configurado (o uno demasiado corto) no entra nadie.
  if (secret.length < MIN_SECRET_LENGTH || !token || !safeEqual(token, secret)) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado." }, { status: 401 }) };
  }

  const ownerId = z.uuid().safeParse(process.env.AUTOMATION_OWNER_ID ?? "");
  if (!ownerId.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "AUTOMATION_OWNER_ID no está configurado." }, { status: 500 }),
    };
  }

  return { ok: true, ownerId: ownerId.data };
}

/** Respuesta de error uniforme para las rutas de automatización. */
export function automationError(status: number, error: string, details?: unknown) {
  return NextResponse.json(details === undefined ? { error } : { error, details }, { status });
}
