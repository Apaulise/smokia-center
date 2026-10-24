// Quién puede escribir en PATCH /api/automation/leads/:id.
//
// El Bearer de AUTOMATION_API_SECRET autentica a la integración. Este archivo
// es el segundo filtro, sólo para esa corrección: el agente se identifica con
// `agent` en el body o con el header `X-Agent`, y tiene que estar en la lista.
// Los GET no pasan por acá.

import { z } from "zod";

/** Si `AUTOMATION_WRITE_AGENTS` no está, éstos son los únicos que pueden corregir un lead. */
export const DEFAULT_AUTOMATION_WRITE_AGENTS = ["ventas", "seguimiento"] as const;

const AGENT_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Id corto, en minúsculas: `ventas`, `seguimiento`, o uno agregado en el env. */
export const automationAgentIdSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(AGENT_ID, "Agente inválido.");

/**
 * Lista efectiva. Vacío o ausente → el default. Una lista explícita reemplaza
 * el default (no se le suma): `ventas,auditor` deja afuera a seguimiento.
 */
export function writeAgentsFromEnv(env: NodeJS.ProcessEnv): string[] {
  const raw = env.AUTOMATION_WRITE_AGENTS;
  if (raw == null || raw.trim() === "") return [...DEFAULT_AUTOMATION_WRITE_AGENTS];
  const list = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return list.length > 0 ? list : [...DEFAULT_AUTOMATION_WRITE_AGENTS];
}

export type AgentDecision =
  | { ok: true; agent: string }
  | { ok: false; status: 400 | 403; error: string };

/**
 * Body y header son equivalentes. Si vienen los dos, tienen que decir lo mismo.
 * Comparación en minúsculas, así `Ventas` y `ventas` son el mismo agente.
 */
export function decideWriteAgent(input: {
  bodyAgent?: string | null;
  headerAgent?: string | null;
  allowed: readonly string[];
}): AgentDecision {
  const body = normalizeRaw(input.bodyAgent);
  const header = normalizeRaw(input.headerAgent);

  if (body && header && body !== header) {
    return { ok: false, status: 400, error: "El agente del body y el del header X-Agent no coinciden." };
  }

  const raw = body || header;
  if (!raw) {
    return { ok: false, status: 400, error: "Indicá el agente en agent o en el header X-Agent." };
  }

  const parsed = automationAgentIdSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Agente inválido." };
  }

  const allowed = new Set(input.allowed.map((item) => item.trim().toLowerCase()));
  if (!allowed.has(parsed.data)) {
    return { ok: false, status: 403, error: "Este agente no puede modificar leads." };
  }

  return { ok: true, agent: parsed.data };
}

function normalizeRaw(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
