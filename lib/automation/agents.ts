// Quién puede escribir en la API de automatización.
//
// El Bearer de AUTOMATION_API_SECRET autentica a la integración. Este archivo
// es el segundo filtro: PATCH /api/automation/leads/:id y POST /api/automation/leads
// miran AUTOMATION_WRITE_AGENTS. /api/automation/admin/* mira AUTOMATION_ADMIN_AGENTS
// (vacío = nadie) y no ensancha esas dos listas. El agente va en `agent` o en
// `X-Agent`. Los GET históricos de leads no pasan por acá.

import { z } from "zod";

/** Si `AUTOMATION_WRITE_AGENTS` no está, éstos son los únicos que pueden corregir un lead. */
export const DEFAULT_AUTOMATION_WRITE_AGENTS = ["ventas", "seguimiento"] as const;

/**
 * Quién puede crear un lead si la variable no está. El default de corrección,
 * más `julian`: el id ya entra en el esquema (`^[a-z0-9]…`) y sumarlo acá no
 * cambia quién puede hacer el PATCH.
 */
export const DEFAULT_AUTOMATION_CREATE_AGENTS = ["ventas", "seguimiento", "julian"] as const;

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
  const list = explicitAgents(env);
  return list ?? [...DEFAULT_AUTOMATION_WRITE_AGENTS];
}

/**
 * Lista efectiva para el alta. Sin variable (o vacía) → el default de
 * creación, que incluye a julian. Una lista explícita reemplaza el default
 * entero, igual que en la corrección: `ventas,auditor` no suma a julian.
 */
export function createAgentsFromEnv(env: NodeJS.ProcessEnv): string[] {
  return explicitAgents(env) ?? [...DEFAULT_AUTOMATION_CREATE_AGENTS];
}

/**
 * Quién puede usar `/api/automation/admin/*`. Vacío o ausente → nadie: el
 * acceso total falla cerrado hasta que se configure (en Vercel,
 * `AUTOMATION_ADMIN_AGENTS=mr-pou`). No se suma a la lista de corrección ni
 * a la de alta. Un id que no entra en el formato se descarta; si no queda
 * ninguno, nadie entra.
 */
export function adminAgentsFromEnv(env: NodeJS.ProcessEnv): string[] {
  const raw = env.AUTOMATION_ADMIN_AGENTS;
  if (raw == null || raw.trim() === "") return [];
  const seen = new Set<string>();
  for (const item of raw.split(",")) {
    const id = item.trim().toLowerCase();
    if (AGENT_ID.test(id)) seen.add(id);
  }
  return [...seen];
}

/** `null` si no hay una lista explícita: el caller pone su default. */
function explicitAgents(env: NodeJS.ProcessEnv): string[] | null {
  const raw = env.AUTOMATION_WRITE_AGENTS;
  if (raw == null || raw.trim() === "") return null;
  const list = raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
  return list.length > 0 ? list : null;
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
  /** Texto del 403. El PATCH habla de modificar; el alta, de crear. */
  deniedMessage?: string;
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
    return { ok: false, status: 403, error: input.deniedMessage ?? "Este agente no puede modificar leads." };
  }

  return { ok: true, agent: parsed.data };
}

function normalizeRaw(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}
