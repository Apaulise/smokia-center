// ⚠️ SERVICE ROLE — saltea RLS. Cada query filtra por `owner_id` (CLAUDE.md §4).
//
// Rol admin de la API de automatización. Sólo entra un agente listado en
// AUTOMATION_ADMIN_AGENTS, y sólo toca la lista blanca de admin-schema.ts.
// owner_id sale de AUTOMATION_OWNER_ID: el body no puede cambiarlo. El borrado
// de leads es soft (status DESCARTADO) y pide confirm=true.

import type { LeadsClient } from "@/lib/leads/contact";
import { meetingGateMessage, passesMeetingGate } from "@/lib/leads/contact";
import type { LeadStatus } from "@/lib/leads/status";

import {
  adminAuditContent,
  adminSelect,
  auditSummaryFor,
  businessViolation,
  changedFields,
  parseAdminListQuery,
  parseAdminWrite,
  prepareLeadDedupe,
  resolveAdminResource,
  type AdminListQuery,
  type AdminResource,
  type AdminTable,
} from "@/lib/automation/admin-schema";

export type AdminResult =
  | { ok: true; status: number; body: Record<string, unknown> }
  | { ok: false; status: number; error: string; details?: unknown; id?: string };

type Row = Record<string, unknown>;

type LooseError = { code?: string; message?: string } | null;

type LooseResult = { data: Row | Row[] | null; error: LooseError; count?: number | null };

interface LooseQuery extends PromiseLike<LooseResult> {
  select: (columns: string, options?: { count?: "exact" }) => LooseQuery;
  insert: (row: Row) => LooseQuery;
  update: (row: Row) => LooseQuery;
  delete: () => LooseQuery;
  eq: (column: string, value: unknown) => LooseQuery;
  neq: (column: string, value: unknown) => LooseQuery;
  in: (column: string, value: unknown) => LooseQuery;
  order: (column: string, options?: { ascending?: boolean }) => LooseQuery;
  range: (from: number, to: number) => LooseQuery;
  maybeSingle: () => Promise<LooseResult>;
  single: () => Promise<LooseResult>;
}

function from(admin: LeadsClient, table: AdminTable): LooseQuery {
  return admin.from(table) as unknown as LooseQuery;
}

function fail(status: number, error: string, extra?: { details?: unknown; id?: string }): AdminResult {
  return { ok: false, status, error, details: extra?.details, id: extra?.id };
}

function ok(status: number, body: Record<string, unknown>): AdminResult {
  return { ok: true, status, body };
}

function asRow(data: LooseResult["data"]): Row | null {
  if (!data || Array.isArray(data)) return null;
  return data;
}

function asRows(data: LooseResult["data"]): Row[] {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
}

function errorCode(error: LooseError): string | null {
  return error?.code ?? null;
}

function mapWriteError(error: LooseError): AdminResult {
  const code = errorCode(error);
  if (code === "23505") return fail(409, "Ya existe una fila con esa clave.");
  if (code === "23503") return fail(400, "La referencia no existe.");
  if (code === "23514") return fail(400, "La fila no cumple una restricción de la base.");
  return fail(500, "No se pudo escribir.");
}

const DEDUPE_SELECT = "id, name";

async function readOwned(
  admin: LeadsClient,
  table: AdminTable,
  ownerId: string,
  id: string,
  columns: string,
): Promise<{ ok: true; row: Row | null } | { ok: false; result: AdminResult }> {
  const { data, error } = await from(admin, table).select(columns).eq("id", id).eq("owner_id", ownerId).maybeSingle();
  if (error) return { ok: false, result: fail(500, "No se pudo leer.") };
  return { ok: true, row: asRow(data) };
}

async function archiveActiveGoals(admin: LeadsClient, ownerId: string, exceptId: string | null): Promise<boolean> {
  let query = from(admin, "sales_goals").update({ status: "ARCHIVADA" }).eq("owner_id", ownerId).eq("status", "ACTIVA");
  if (exceptId) query = query.neq("id", exceptId);
  const { error } = await query;
  return !error;
}

async function insertOwned(
  admin: LeadsClient,
  ownerId: string,
  table: AdminTable,
  row: Row,
  columns: string,
): Promise<{ ok: true; row: Row } | { ok: false; result: AdminResult }> {
  const stored: Row = { ...row, owner_id: ownerId };
  delete stored.id;
  delete stored.created_at;
  delete stored.updated_at;
  delete stored.search;
  const run = () => from(admin, table).insert(stored).select(columns).single();
  let result = await run();
  if (errorCode(result.error) === "23505" && table === "sales_goals" && stored.status !== "ARCHIVADA") {
    const archived = await archiveActiveGoals(admin, ownerId, null);
    if (!archived) return { ok: false, result: fail(500, "No se pudo archivar el objetivo activo.") };
    result = await run();
  }
  if (result.error || !asRow(result.data)) return { ok: false, result: mapWriteError(result.error) };
  return { ok: true, row: asRow(result.data) as Row };
}

async function updateOwned(
  admin: LeadsClient,
  ownerId: string,
  table: AdminTable,
  id: string,
  row: Row,
  columns: string,
): Promise<{ ok: true; row: Row | null } | { ok: false; result: AdminResult }> {
  const stored: Row = { ...row };
  delete stored.owner_id;
  delete stored.id;
  delete stored.created_at;
  delete stored.updated_at;
  delete stored.search;
  const run = () =>
    from(admin, table).update(stored).eq("id", id).eq("owner_id", ownerId).select(columns).maybeSingle();
  let result = await run();
  if (errorCode(result.error) === "23505" && table === "sales_goals") {
    const archived = await archiveActiveGoals(admin, ownerId, id);
    if (!archived) return { ok: false, result: fail(500, "No se pudo archivar el objetivo activo.") };
    result = await run();
  }
  if (result.error) return { ok: false, result: mapWriteError(result.error) };
  return { ok: true, row: asRow(result.data) };
}

async function assertRefs(
  admin: LeadsClient,
  ownerId: string,
  resource: AdminResource,
  row: Row,
): Promise<AdminResult | null> {
  for (const ref of resource.refs) {
    if (!Object.prototype.hasOwnProperty.call(row, ref.column)) continue;
    const value = row[ref.column];
    if (value == null) continue;
    if (typeof value !== "string") return fail(400, "Referencia inválida.");
    const found = await readOwned(admin, ref.table, ownerId, value, "id");
    if (!found.ok) return found.result;
    if (!found.row) {
      return fail(ref.table === "leads" ? 404 : 400, ref.table === "leads" ? "Lead no encontrado." : "No se encontró la referencia.");
    }
  }
  return null;
}

async function findDedupeClash(
  admin: LeadsClient,
  ownerId: string,
  dedupeKey: string,
  exceptId: string | null,
): Promise<{ id: string; name: string } | null | "error"> {
  const { data, error } = await from(admin, "leads")
    .select(DEDUPE_SELECT)
    .eq("owner_id", ownerId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  if (error) return "error";
  const row = asRow(data);
  if (!row || typeof row.id !== "string") return null;
  if (exceptId && row.id === exceptId) return null;
  return { id: row.id, name: typeof row.name === "string" ? row.name : "otro lead" };
}

async function insertAudit(
  admin: LeadsClient,
  ownerId: string,
  leadId: string,
  agent: string,
  summary: string,
): Promise<{ id: string; type: "NOTA"; content: string } | null> {
  const content = adminAuditContent(agent, summary);
  const { data, error } = await from(admin, "lead_activities")
    .insert({ owner_id: ownerId, lead_id: leadId, type: "NOTA", content })
    .select("id, type, content")
    .single();
  const row = asRow(data);
  if (error || !row || typeof row.id !== "string") return null;
  return { id: row.id, type: "NOTA", content: typeof row.content === "string" ? row.content : content };
}

async function rollbackActivity(admin: LeadsClient, ownerId: string, activityId: string) {
  await from(admin, "lead_activities").delete().eq("id", activityId).eq("owner_id", ownerId);
}

function leadIdsFor(resource: AdminResource, rowId: string, current: Row | null, patch: Row): string[] {
  if (resource.leadLink === "id") return [rowId];
  if (resource.leadLink !== "lead_id") return [];
  const ids = new Set<string>();
  const next = Object.prototype.hasOwnProperty.call(patch, "lead_id") ? patch.lead_id : current?.lead_id;
  const previous = current?.lead_id;
  if (typeof next === "string") ids.add(next);
  if (typeof previous === "string") ids.add(previous);
  return [...ids];
}

async function writeAudits(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  leadIds: string[],
  summary: string,
): Promise<{ ok: true; audits: { id: string; type: "NOTA"; content: string }[] } | { ok: false }> {
  const audits = [];
  for (const leadId of leadIds) {
    const audit = await insertAudit(admin, ownerId, leadId, agent, summary);
    if (!audit) {
      for (const written of audits) await rollbackActivity(admin, ownerId, written.id);
      return { ok: false };
    }
    audits.push(audit);
  }
  return { ok: true, audits };
}

export async function listAdminRows(
  admin: LeadsClient,
  ownerId: string,
  resourceName: string,
  rawQuery: Record<string, string | undefined>,
): Promise<AdminResult> {
  const resource = resolveAdminResource(resourceName);
  if (!resource) return fail(404, "Ese recurso no está en la lista blanca.");
  const parsed = parseAdminListQuery(resource, rawQuery);
  if (!parsed.ok) return fail(400, parsed.error, { details: parsed.details });
  return runList(admin, ownerId, resource, parsed.query);
}

async function runList(admin: LeadsClient, ownerId: string, resource: AdminResource, query: AdminListQuery): Promise<AdminResult> {
  let request = from(admin, resource.table)
    .select(adminSelect(resource, "list", query.includeRaw), { count: "exact" })
    .eq("owner_id", ownerId);
  for (const filter of query.filters) request = request.eq(filter.column, filter.value);
  const { data, error, count } = await request
    .order(query.order, { ascending: query.ascending })
    .range(query.offset, query.offset + query.limit - 1);
  if (error) return fail(500, "No se pudo leer.");
  return ok(200, {
    resource: resource.name,
    rows: asRows(data),
    count: count ?? asRows(data).length,
    limit: query.limit,
    offset: query.offset,
  });
}

export async function getAdminRow(admin: LeadsClient, ownerId: string, resourceName: string, id: string): Promise<AdminResult> {
  const resource = resolveAdminResource(resourceName);
  if (!resource) return fail(404, "Ese recurso no está en la lista blanca.");
  const found = await readOwned(admin, resource.table, ownerId, id, adminSelect(resource, "one", true));
  if (!found.ok) return found.result;
  if (!found.row) return fail(404, "No encontrado.");
  return ok(200, { resource: resource.name, row: found.row });
}

type WriteOptions = { auditSummary?: string };

export async function createAdminRow(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  resourceName: string,
  body: unknown,
  options?: WriteOptions,
): Promise<AdminResult> {
  const resource = resolveAdminResource(resourceName);
  if (!resource) return fail(404, "Ese recurso no está en la lista blanca.");
  const parsed = parseAdminWrite(resource, body, "insert");
  if (!parsed.ok) return fail(400, parsed.error, { details: parsed.details });

  let row = parsed.row;
  if (resource.table === "leads") {
    const prepared = prepareLeadDedupe(null, row);
    if (!prepared.ok) return fail(400, prepared.error);
    if (!prepared.dedupeKey) return fail(500, "No se pudo calcular la clave del lead.");
    const clash = await findDedupeClash(admin, ownerId, prepared.dedupeKey, null);
    if (clash === "error") return fail(500, "No se pudo leer.");
    if (clash) return fail(409, `Ya existe un lead con esa clave: "${clash.name}".`, { id: clash.id });
    row = { ...prepared.row, dedupe_key: prepared.dedupeKey };
  }

  const refs = await assertRefs(admin, ownerId, resource, row);
  if (refs) return refs;
  const violation = businessViolation(resource.table, row);
  if (violation) return fail(400, violation);
  if (resource.table === "leads" && typeof row.status === "string") {
    const gate = await gateStatus(admin, ownerId, null, row.status);
    if (gate) return gate;
  }

  const columns = adminSelect(resource, "one", true);
  const inserted = await insertOwned(admin, ownerId, resource.table, row, columns);
  if (!inserted.ok) return inserted.result;

  const leadIds = leadIdsFor(resource, String(inserted.row.id), null, row);
  if (leadIds.length === 0) {
    return ok(201, { resource: resource.name, row: inserted.row, audit: null });
  }
  const summary = auditSummaryFor(resource, "create", row, {}, options?.auditSummary);
  const audits = await writeAudits(admin, ownerId, agent, leadIds, summary);
  if (!audits.ok) {
    await from(admin, resource.table).delete().eq("id", inserted.row.id).eq("owner_id", ownerId);
    return fail(500, "No se pudo anotar la auditoría.");
  }
  return ok(201, { resource: resource.name, row: inserted.row, audit: audits.audits[0] ?? null });
}

async function gateStatus(
  admin: LeadsClient,
  ownerId: string,
  leadId: string | null,
  status: string,
): Promise<AdminResult | null> {
  if (status !== "REUNION_AGENDADA" && status !== "REUNION_REALIZADA") return null;
  if (!leadId) {
    return fail(409, meetingGateMessage(status as LeadStatus));
  }
  const passes = await passesMeetingGate(admin, leadId, status as LeadStatus, ownerId);
  if (!passes) return fail(409, meetingGateMessage(status as LeadStatus));
  return null;
}

export async function updateAdminRow(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  resourceName: string,
  id: string,
  body: unknown,
  options?: WriteOptions,
): Promise<AdminResult> {
  const resource = resolveAdminResource(resourceName);
  if (!resource) return fail(404, "Ese recurso no está en la lista blanca.");
  const parsed = parseAdminWrite(resource, body, "update");
  if (!parsed.ok) return fail(400, parsed.error, { details: parsed.details });
  return applyUpdate(admin, ownerId, agent, resource, id, parsed.row, options);
}

async function applyUpdate(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  resource: AdminResource,
  id: string,
  patch: Row,
  options?: WriteOptions,
): Promise<AdminResult> {
  const columns = adminSelect(resource, "one", true);
  const currentRead = await readOwned(admin, resource.table, ownerId, id, columns);
  if (!currentRead.ok) return currentRead.result;
  if (!currentRead.row) return fail(404, "No encontrado.");
  const current = currentRead.row;

  let nextPatch = patch;
  if (resource.table === "leads") {
    const prepared = prepareLeadDedupe(current, patch);
    if (!prepared.ok) return fail(400, prepared.error);
    if (prepared.dedupeKey) {
      const clash = await findDedupeClash(admin, ownerId, prepared.dedupeKey, id);
      if (clash === "error") return fail(500, "No se pudo leer.");
      if (clash) return fail(409, `Ese teléfono ya está en "${clash.name}".`, { id: clash.id });
    }
    nextPatch = prepared.row;
  }

  const changes = changedFields(current, nextPatch);
  if (Object.keys(changes).length === 0) {
    return ok(200, { resource: resource.name, changed: false, row: current, audit: null });
  }

  const merged = { ...current, ...changes };
  const violation = businessViolation(resource.table, merged);
  if (violation) return fail(400, violation);
  const refs = await assertRefs(admin, ownerId, resource, changes);
  if (refs) return refs;
  if (resource.table === "leads" && typeof changes.status === "string") {
    const gate = await gateStatus(admin, ownerId, id, changes.status);
    if (gate) return gate;
  }

  const summary = auditSummaryFor(resource, "update", changes, current, options?.auditSummary);
  const leadIds = leadIdsFor(resource, id, current, changes);
  const audits = await writeAudits(admin, ownerId, agent, leadIds, summary);
  if (!audits.ok) return fail(500, "No se pudo anotar la auditoría.");

  let cambioId: string | null = null;
  if (resource.table === "leads" && typeof changes.status === "string") {
    const cambio = await from(admin, "lead_activities")
      .insert({
        owner_id: ownerId,
        lead_id: id,
        type: "CAMBIO_ESTADO",
        from_status: current.status ?? null,
        to_status: changes.status,
      })
      .select("id")
      .single();
    const cambioRow = asRow(cambio.data);
    if (cambio.error || !cambioRow || typeof cambioRow.id !== "string") {
      for (const audit of audits.audits) await rollbackActivity(admin, ownerId, audit.id);
      return fail(500, "No se pudo anotar el cambio de estado.");
    }
    cambioId = cambioRow.id;
  }

  const updated = await updateOwned(admin, ownerId, resource.table, id, changes, columns);
  if (!updated.ok || !updated.row) {
    if (cambioId) await rollbackActivity(admin, ownerId, cambioId);
    for (const audit of audits.audits) await rollbackActivity(admin, ownerId, audit.id);
    return updated.ok ? fail(404, "No encontrado.") : updated.result;
  }

  return ok(200, {
    resource: resource.name,
    changed: true,
    row: updated.row,
    audit: audits.audits[0] ?? null,
  });
}

export async function deleteAdminRow(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  resourceName: string,
  id: string,
  confirm: boolean,
): Promise<AdminResult> {
  const resource = resolveAdminResource(resourceName);
  if (!resource) return fail(404, "Ese recurso no está en la lista blanca.");
  if (!confirm) return fail(400, "El borrado pide confirm=true.");
  if (resource.deleteMode === "soft") {
    const result = await applyUpdate(admin, ownerId, agent, resource, id, { status: "DESCARTADO" }, {
      auditSummary: "lead descartado vía API admin",
    });
    if (!result.ok) return result;
    return ok(result.status, { ...result.body, deleted: false, softDeleted: true });
  }

  const columns = adminSelect(resource, "one", true);
  const currentRead = await readOwned(admin, resource.table, ownerId, id, columns);
  if (!currentRead.ok) return currentRead.result;
  if (!currentRead.row) return fail(404, "No encontrado.");

  const summary = auditSummaryFor(resource, "delete", {}, currentRead.row);
  const leadIds = leadIdsFor(resource, id, currentRead.row, {});
  const audits = await writeAudits(admin, ownerId, agent, leadIds, summary);
  if (!audits.ok) return fail(500, "No se pudo anotar la auditoría.");

  const deleted = await from(admin, resource.table).delete().eq("id", id).eq("owner_id", ownerId).select("id").maybeSingle();
  if (deleted.error || !asRow(deleted.data)) {
    for (const audit of audits.audits) await rollbackActivity(admin, ownerId, audit.id);
    return deleted.error ? mapWriteError(deleted.error) : fail(404, "No encontrado.");
  }

  return ok(200, {
    resource: resource.name,
    deleted: true,
    softDeleted: false,
    id,
    audit: audits.audits[0] ?? null,
  });
}

export async function setAdminLeadStatus(
  admin: LeadsClient,
  ownerId: string,
  agent: string,
  leadId: string,
  status: string,
): Promise<AdminResult> {
  return updateAdminRow(admin, ownerId, agent, "leads", leadId, { status });
}
