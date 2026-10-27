import assert from "node:assert/strict";
import { test } from "node:test";

import {
  adminAgentsFromEnv,
  createAgentsFromEnv,
  decideWriteAgent,
  writeAgentsFromEnv,
} from "../lib/automation/agents.ts";
import {
  createAdminRow,
  deleteAdminRow,
  listAdminRows,
  setAdminLeadStatus,
  updateAdminRow,
} from "../lib/automation/admin.ts";
import {
  adminAuditContent,
  adminCatalog,
  adminLeadMessageSchema,
  parseAdminListQuery,
  parseAdminWrite,
  resolveAdminResource,
} from "../lib/automation/admin-schema.ts";
import { leadPlanningBodySchema } from "../lib/automation/lead-planning.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LEAD = "11111111-1111-4111-8111-111111111111";
const INDUSTRY = "22222222-2222-4222-8222-222222222222";
const GOAL = "33333333-3333-4333-8333-333333333333";
const MESSAGE = "44444444-4444-4444-8444-444444444444";

const DENIED = ["settings", "scrape_jobs", "profiles", "teams", "team_members", "team_goals", "brand_posts", "brand_accounts"];

function mockAdmin(handlers) {
  const log = [];
  return {
    log,
    client: {
      from(table) {
        const calls = [];
        log.push({ table, calls });
        const resolve = () => {
          const handler = handlers[table];
          if (!handler) throw new Error(`tabla inesperada: ${table}`);
          return handler(calls);
        };
        const builder = {
          select(columns, options) {
            calls.push({ method: "select", columns, options });
            return builder;
          },
          insert(row) {
            calls.push({ method: "insert", row });
            return builder;
          },
          update(row) {
            calls.push({ method: "update", row });
            return builder;
          },
          delete() {
            calls.push({ method: "delete" });
            return builder;
          },
          eq(column, value) {
            calls.push({ method: "eq", column, value });
            return builder;
          },
          neq(column, value) {
            calls.push({ method: "neq", column, value });
            return builder;
          },
          in(column, value) {
            calls.push({ method: "in", column, value });
            return builder;
          },
          order(column, options) {
            calls.push({ method: "order", column, options });
            return builder;
          },
          range(from, to) {
            calls.push({ method: "range", from, to });
            return builder;
          },
          maybeSingle() {
            return Promise.resolve(resolve());
          },
          single() {
            return Promise.resolve(resolve());
          },
          then(onFulfilled, onRejected) {
            return Promise.resolve(resolve()).then(onFulfilled, onRejected);
          },
        };
        return builder;
      },
    },
  };
}

function assertScoped(log, owner) {
  assert.ok(log.length > 0, "no hubo queries");
  for (const entry of log) {
    const insert = entry.calls.find((call) => call.method === "insert");
    const update = entry.calls.find((call) => call.method === "update");
    const ownerEqs = entry.calls.filter((call) => call.method === "eq" && call.column === "owner_id");
    if (insert) assert.equal(insert.row.owner_id, owner, entry.table);
    if (update && Object.prototype.hasOwnProperty.call(update.row, "owner_id")) {
      assert.equal(update.row.owner_id, owner);
    }
    if (!insert) assert.ok(ownerEqs.some((call) => call.value === owner), `${entry.table} sin owner_id`);
    assert.ok(ownerEqs.every((call) => call.value === owner), entry.table);
  }
}

test("el admin falla cerrado y no mueve la allowlist de ventas, seguimiento ni julian", () => {
  assert.deepEqual(adminAgentsFromEnv({}), []);
  assert.deepEqual(adminAgentsFromEnv({ AUTOMATION_ADMIN_AGENTS: "   " }), []);
  assert.deepEqual(adminAgentsFromEnv({ AUTOMATION_ADMIN_AGENTS: "Mr Pou, !!!" }), []);
  assert.deepEqual(adminAgentsFromEnv({ AUTOMATION_ADMIN_AGENTS: " MR-POU, ventas " }), ["mr-pou", "ventas"]);
  assert.deepEqual(writeAgentsFromEnv({}), ["ventas", "seguimiento"]);
  assert.deepEqual(createAgentsFromEnv({}), ["ventas", "seguimiento", "julian"]);
  assert.equal(writeAgentsFromEnv({}).includes("mr-pou"), false);
  assert.equal(createAgentsFromEnv({}).includes("mr-pou"), false);
  assert.deepEqual(writeAgentsFromEnv({ AUTOMATION_ADMIN_AGENTS: "mr-pou" }), ["ventas", "seguimiento"]);
  assert.deepEqual(createAgentsFromEnv({ AUTOMATION_ADMIN_AGENTS: "mr-pou" }), ["ventas", "seguimiento", "julian"]);

  const allowed = adminAgentsFromEnv({ AUTOMATION_ADMIN_AGENTS: "mr-pou" });
  assert.deepEqual(decideWriteAgent({ headerAgent: "Mr-Pou", allowed }), { ok: true, agent: "mr-pou" });
  assert.deepEqual(
    decideWriteAgent({
      bodyAgent: "julian",
      allowed,
      deniedMessage: "Este agente no tiene acceso de administrador.",
    }),
    { ok: false, status: 403, error: "Este agente no tiene acceso de administrador." },
  );
  assert.deepEqual(decideWriteAgent({ bodyAgent: "mr-pou", allowed: writeAgentsFromEnv({}) }).ok, false);
});

test("la lista blanca es el CRM y deja afuera secretos, marca y equipo", () => {
  for (const name of DENIED) assert.equal(resolveAdminResource(name), null, name);
  const names = adminCatalog().map((entry) => entry.resource);
  assert.ok(names.includes("leads"));
  assert.ok(names.includes("goals"));
  assert.ok(names.includes("sales_goals"));
  assert.ok(names.includes("appointments"));
  for (const name of DENIED) assert.equal(names.includes(name), false, name);

  for (const entry of adminCatalog()) {
    const resource = resolveAdminResource(entry.resource);
    assert.ok(resource);
    for (const column of resource.writable) {
      assert.ok(resource.columns.includes(column), `${entry.resource}.${column}`);
    }
    assert.equal(resource.writable.includes("owner_id"), false);
    assert.equal(resource.writable.includes("search"), false);
    assert.equal(resource.columns.includes("search"), false);
  }

  assert.equal(resolveAdminResource("leads").deleteMode, "soft");
  assert.equal(resolveAdminResource("goals").table, "sales_goals");
  assert.equal(resolveAdminResource("lead_messages").deleteMode, "hard");
});

test("el PATCH histórico sigue sin status y el admin sí lo acepta", () => {
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "hola", status: "CONTACTADO" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "hola", email: "hola@acme.com" }).success, false);

  const leads = resolveAdminResource("leads");
  const status = parseAdminWrite(leads, { status: "CONTACTADO", agent: "mr-pou" }, "update");
  assert.equal(status.ok, true);
  if (status.ok) assert.deepEqual(status.row, { status: "CONTACTADO" });

  const blocked = parseAdminWrite(leads, { owner_id: OWNER, name: "Acme" }, "insert");
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.match(blocked.error, /owner_id/);
  const dedupe = parseAdminWrite(leads, { name: "Acme", dedupe_key: "phone:+1" }, "insert");
  assert.equal(dedupe.ok, false);

  const created = parseAdminWrite(
    leads,
    { agent: "mr-pou", name: "Acme", phone: "+54 9 11 5555-6666", email: "Hola@Acme.com", notes: "  nota  " },
    "insert",
  );
  assert.equal(created.ok, true);
  if (created.ok) {
    assert.equal(created.row.phone, "+5491155556666");
    assert.equal(created.row.email, "hola@acme.com");
    assert.equal(created.row.notes, "nota");
    assert.equal("owner_id" in created.row, false);
  }

  const messages = resolveAdminResource("lead_messages");
  const exact = parseAdminWrite(
    messages,
    { lead_id: LEAD, sender: "VENDEDOR", content: "  Hola, texto exacto  " },
    "insert",
  );
  assert.equal(exact.ok, true);
  if (exact.ok) assert.equal(exact.row.content, "  Hola, texto exacto  ");

  const specific = adminLeadMessageSchema.safeParse({
    lead_id: LEAD,
    sender: "LEAD",
    content: "  Hola, texto exacto  ",
    generated_by: "IA",
  });
  assert.equal(specific.success, false);
});

test("la lista rechaza owner_id y por defecto no trae raw", () => {
  const leads = resolveAdminResource("leads");
  const rejected = parseAdminListQuery(leads, { owner_id: OWNER });
  assert.equal(rejected.ok, false);
  const page = parseAdminListQuery(leads, { status: "nuevo", limit: "10" });
  assert.equal(page.ok, true);
  if (page.ok) {
    assert.equal(page.query.includeRaw, false);
    assert.deepEqual(page.query.filters, [{ column: "status", value: "NUEVO" }]);
    assert.equal(page.query.limit, 10);
  }
});

test("la nota de auditoría lleva el agente y no el texto del mensaje", () => {
  assert.equal(adminAuditContent("mr-pou", "mensaje registrado"), "[mr-pou] mensaje registrado");
  assert.equal(adminAuditContent("mr-pou", "x".repeat(5000)).length, 4000);
});

test("crear un lead fija el owner, normaliza el teléfono y deja la nota", async () => {
  const { client, log } = mockAdmin({
    leads(calls) {
      const select = calls.find((call) => call.method === "select");
      if (select?.columns === "id, name") return { data: null, error: null };
      const insert = calls.find((call) => call.method === "insert");
      return { data: { id: LEAD, ...insert.row }, error: null };
    },
    lead_activities(calls) {
      const insert = calls.find((call) => call.method === "insert");
      return { data: { id: "55555555-5555-4555-8555-555555555555", type: insert.row.type, content: insert.row.content }, error: null };
    },
  });

  const result = await createAdminRow(client, OWNER, "mr-pou", "leads", {
    agent: "mr-pou",
    name: "Acme",
    phone: "+54 9 11 5555-6666",
    email: "Hola@Acme.com",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.status, 201);
  assert.equal(result.body.row.owner_id, OWNER);
  assert.equal(result.body.row.phone, "+5491155556666");
  assert.equal(result.body.row.dedupe_key, "phone:+5491155556666");
  assert.equal(result.body.audit.content, "[mr-pou] lead creado vía API admin");
  assertScoped(log, OWNER);
  assert.equal(log.some((entry) => entry.calls.some((call) => call.row?.owner_id && call.row.owner_id !== OWNER)), false);
});

test("un industry de otro owner no se escribe", async () => {
  const { client, log } = mockAdmin({
    leads(calls) {
      const select = calls.find((call) => call.method === "select");
      if (select?.columns === "id, name") return { data: null, error: null };
      throw new Error("no debía insertar el lead");
    },
    industries() {
      return { data: null, error: null };
    },
  });

  const result = await createAdminRow(client, OWNER, "mr-pou", "leads", {
    name: "Acme",
    industry_id: INDUSTRY,
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 400);
  assert.equal(log.some((entry) => entry.calls.some((call) => call.method === "insert")), false);
  assertScoped(log, OWNER);
});

test("repetir la misma nota no duplica la auditoría", async () => {
  const current = {
    id: LEAD,
    owner_id: OWNER,
    name: "Acme",
    notes: "hola",
    status: "NUEVO",
    phone: null,
    dedupe_key: "slug:acme-",
  };
  const { client, log } = mockAdmin({
    leads() {
      return { data: current, error: null };
    },
  });

  const result = await updateAdminRow(client, OWNER, "mr-pou", "leads", LEAD, { notes: "  hola  " });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.changed, false);
  assert.equal(result.body.audit, null);
  assert.equal(log.some((entry) => entry.calls.some((call) => call.method === "insert" || call.method === "update")), false);
  assertScoped(log, OWNER);
});

test("descartar un lead es soft, pide confirm y deja la nota", async () => {
  const silent = { from() { throw new Error("no debía consultar"); } };
  const refused = await deleteAdminRow(silent, OWNER, "mr-pou", "leads", LEAD, false);
  assert.equal(refused.ok, false);
  if (refused.ok) return;
  assert.equal(refused.status, 400);
  assert.match(refused.error, /confirm=true/);

  const current = { id: LEAD, owner_id: OWNER, name: "Acme", status: "NUEVO", dedupe_key: "slug:acme-" };
  const { client, log } = mockAdmin({
    leads(calls) {
      const update = calls.find((call) => call.method === "update");
      if (update) return { data: { ...current, ...update.row }, error: null };
      return { data: current, error: null };
    },
    lead_activities(calls) {
      const insert = calls.find((call) => call.method === "insert");
      return { data: { id: "55555555-5555-4555-8555-555555555555", type: insert.row.type, content: insert.row.content ?? null }, error: null };
    },
  });

  const result = await deleteAdminRow(client, OWNER, "mr-pou", "leads", LEAD, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.deleted, false);
  assert.equal(result.body.softDeleted, true);
  assert.equal(result.body.changed, true);
  assert.equal(result.body.row.status, "DESCARTADO");
  assert.equal(result.body.audit.content, "[mr-pou] lead descartado vía API admin");
  assert.equal(log.some((entry) => entry.table === "leads" && entry.calls.some((call) => call.method === "delete")), false);
  const activities = log.filter((entry) => entry.table === "lead_activities");
  assert.equal(activities.length, 2);
  const types = activities.map((entry) => entry.calls.find((call) => call.method === "insert").row.type);
  assert.deepEqual(types.sort(), ["CAMBIO_ESTADO", "NOTA"]);
  assertScoped(log, OWNER);
});

test("borrar un mensaje es físico, sigue escopeado al owner y audita el lead", async () => {
  const row = { id: MESSAGE, owner_id: OWNER, lead_id: LEAD, content: "Hola", sender: "VENDEDOR" };
  const { client, log } = mockAdmin({
    lead_messages(calls) {
      if (calls.some((call) => call.method === "delete")) return { data: { id: MESSAGE }, error: null };
      return { data: row, error: null };
    },
    lead_activities(calls) {
      const insert = calls.find((call) => call.method === "insert");
      return { data: { id: "55555555-5555-4555-8555-555555555555", type: "NOTA", content: insert.row.content }, error: null };
    },
  });

  const result = await deleteAdminRow(client, OWNER, "mr-pou", "lead_messages", MESSAGE, true);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.deleted, true);
  assert.equal(result.body.softDeleted, false);
  assert.match(result.body.audit.content, /^\[mr-pou\] /);
  const removed = log.find((entry) => entry.table === "lead_messages" && entry.calls.some((call) => call.method === "delete"));
  assert.ok(removed);
  assert.equal(removed.calls.find((call) => call.method === "eq" && call.column === "id").value, MESSAGE);
  assertScoped(log, OWNER);
});

test("el estado de reunión no pasa el gate y no escribe", async () => {
  const current = { id: LEAD, owner_id: OWNER, name: "Acme", status: "NUEVO", dedupe_key: "slug:acme-" };
  const { client, log } = mockAdmin({
    leads() {
      return { data: current, error: null };
    },
    appointments() {
      return { data: [], error: null };
    },
  });

  const result = await setAdminLeadStatus(client, OWNER, "mr-pou", LEAD, "REUNION_AGENDADA");
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.status, 409);
  assert.equal(log.some((entry) => entry.calls.some((call) => call.method === "update" || call.method === "insert")), false);
  assertScoped(log, OWNER);
});

test("un objetivo activo nuevo archiva el anterior y no cruza owners", async () => {
  let inserts = 0;
  const { client, log } = mockAdmin({
    sales_goals(calls) {
      if (calls.some((call) => call.method === "update")) return { data: null, error: null };
      inserts += 1;
      const insert = calls.find((call) => call.method === "insert");
      if (inserts === 1) return { data: null, error: { code: "23505", message: "duplicate" } };
      return { data: { id: GOAL, ...insert.row, status: "ACTIVA" }, error: null };
    },
  });

  const result = await createAdminRow(client, OWNER, "mr-pou", "goals", {
    agent: "mr-pou",
    monthly_revenue_target: 5000,
    avg_ticket: 250,
    booking_rate: 0.2,
    show_rate: 0.5,
    close_rate: 0.3,
    working_days_per_month: 20,
    working_days_per_week: 5,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.resource, "goals");
  assert.equal(result.body.row.owner_id, OWNER);
  assert.equal(result.body.audit, null);
  assert.equal(inserts, 2);
  const archive = log.find((entry) => entry.calls.some((call) => call.method === "update"));
  assert.ok(archive);
  assert.equal(archive.calls.find((call) => call.method === "update").row.status, "ARCHIVADA");
  assertScoped(log, OWNER);
});

test("listar leads filtra por el owner y omite raw", async () => {
  const { client, log } = mockAdmin({
    leads() {
      return { data: [{ id: LEAD, name: "Acme" }], error: null, count: 1 };
    },
  });
  const closed = { from() { throw new Error("no debía consultar"); } };
  const rejected = await listAdminRows(closed, OWNER, "leads", { owner_id: OWNER });
  assert.equal(rejected.ok, false);
  if (rejected.ok) return;
  assert.equal(rejected.status, 400);

  const missing = await listAdminRows(closed, OWNER, "settings", {});
  assert.equal(missing.ok, false);
  if (missing.ok) return;
  assert.equal(missing.status, 404);

  const result = await listAdminRows(client, OWNER, "leads", { status: "NUEVO" });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.body.count, 1);
  const select = log[0].calls.find((call) => call.method === "select");
  assert.equal(select.columns.includes("raw"), false);
  assert.equal(select.columns.includes("notes"), true);
  assertScoped(log, OWNER);
});
