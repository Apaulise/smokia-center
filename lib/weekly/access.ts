import {
  adminAgentsFromEnv,
  createAgentsFromEnv,
  weeklyAgentsFromEnv,
  writeAgentsFromEnv,
} from "@/lib/automation/agents";

import type { WeeklyAreaId } from "./areas";

const OPENING_AREAS = new Set<WeeklyAreaId>(["whatsapp", "email"]);

/**
 * Unión de los agentes que pueden llegar a publicar alguna área. El filtro
 * fino es `canPublishWeekly`: un agente de la lista puede igual recibir 403
 * si el área no le corresponde.
 */
export function weeklyPublishAgents(env: NodeJS.ProcessEnv): string[] {
  return unique([
    ...adminAgentsFromEnv(env),
    ...weeklyAgentsFromEnv(env),
    ...createAgentsFromEnv(env),
    ...writeAgentsFromEnv(env),
  ]);
}

/**
 * mr-pou (o quien esté en `AUTOMATION_ADMIN_AGENTS`) y `AUTOMATION_WEEKLY_AGENTS`
 * publican cualquier área. WhatsApp y email, además, los agentes de alta
 * (por defecto ventas, seguimiento y julian). Seguimientos, los de escritura
 * (por defecto ventas y seguimiento). Instagram, YouTube y X/Threads no
 * tienen agente comercial por defecto.
 */
export function canPublishWeekly(agent: string, area: WeeklyAreaId, env: NodeJS.ProcessEnv): boolean {
  const id = agent.trim().toLowerCase();
  if (adminAgentsFromEnv(env).includes(id)) return true;
  if (weeklyAgentsFromEnv(env).includes(id)) return true;
  if (OPENING_AREAS.has(area) && createAgentsFromEnv(env).includes(id)) return true;
  if (area === "seguimientos" && writeAgentsFromEnv(env).includes(id)) return true;
  return false;
}

/** Leer es el mismo permiso que publicar: cada agente ve las áreas que puede escribir. */
export function canReadWeekly(agent: string, area: WeeklyAreaId, env: NodeJS.ProcessEnv): boolean {
  return canPublishWeekly(agent, area, env);
}

export function canListAllWeekly(agent: string, env: NodeJS.ProcessEnv): boolean {
  const id = agent.trim().toLowerCase();
  return adminAgentsFromEnv(env).includes(id) || weeklyAgentsFromEnv(env).includes(id);
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
