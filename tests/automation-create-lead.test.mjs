import assert from "node:assert/strict";
import { test } from "node:test";

import { createAgentsFromEnv, decideWriteAgent, writeAgentsFromEnv } from "../lib/automation/agents.ts";
import {
  CREATE_LEAD_ACTIVITY_TYPE,
  createLeadActivityContent,
  createLeadBodySchema,
  createLeadForAutomation,
  toCreateLeadInput,
} from "../lib/automation/create-lead.ts";
import { getLeadForAutomation, listLeadsForAutomation, listLeadsQuerySchema } from "../lib/automation/leads.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LIST_ID = "33333333-3333-4333-8333-333333333333";
const EXISTING_ID = "11111111-1111-4111-8111-111111111111";

function parse(body) {
  const parsed = createLeadBodySchema.safeParse(body);
  if (!parsed.success) assert.fail(JSON.stringify(parsed.error.issues));
  return toCreateLeadInput(parsed.data);
}

test("el alta pide nombre y acepta ciudad, sitio, email, teléfono, notas y lista", () => {
  assert.equal(createLeadBodySchema.safeParse({}).success, false);
  assert.equal(createLeadBodySchema.safeParse({ name: "A" }).success, false);
  assert.equal(createLeadBodySchema.safeParse({ name: "Acme", status: "CONTACTADO" }).success, false);
  assert.equal(createLeadBodySchema.safeParse({ name: "Acme", phone: "123" }).success, false);
  assert.equal(createLeadBodySchema.safeParse({ name: "Acme", email: "no-es-un-mail" }).success, false);
  assert.equal(
    createLeadBodySchema.safeParse({ name: "Acme", list: "Dentistas", lista: "Gimnasios" }).success,
    false,
  );

  assert.deepEqual(parse({ name: "  Acme  ", agent: "Julian" }), {
    name: "Acme",
    city: null,
    website: null,
    email: null,
    phone: null,
    notes: null,
    listRef: null,
  });
  const withAgent = createLeadBodySchema.safeParse({ name: "Acme", agent: "Julian" });
  assert.equal(withAgent.success, true);
  if (withAgent.success) assert.equal(withAgent.data.agent, "julian");

  assert.deepEqual(
    parse({
      name: "Acme",
      city: " Rosario ",
      website: " https://acme.com ",
      email: " Hola@Acme.com ",
      phone: "+54 9 11 5555-6666",
      notes: "  Llegó por el formulario.  ",
      lista: " Dentistas Rosario ",
    }),
    {
      name: "Acme",
      city: "Rosario",
      website: "https://acme.com",
      email: "hola@acme.com",
      phone: "+54 9 11 5555-6666",
      notes: "Llegó por el formulario.",
      listRef: "Dentistas Rosario",
    },
  );
  assert.equal(parse({ name: "Acme", email: "", phone: null, list: LIST_ID }).email, null);
  assert.equal(parse({ name: "Acme", list: LIST_ID, lista: LIST_ID }).listRef, LIST_ID);
});

test("julian puede crear cuando no hay allowlist explícita, y no puede corregir", () => {
  assert.deepEqual(writeAgentsFromEnv({}), ["ventas", "seguimiento"]);
  assert.deepEqual(createAgentsFromEnv({}), ["ventas", "seguimiento", "julian"]);
  assert.deepEqual(createAgentsFromEnv({ AUTOMATION_WRITE_AGENTS: "   " }), ["ventas", "seguimiento", "julian"]);
  assert.deepEqual(createAgentsFromEnv({ AUTOMATION_WRITE_AGENTS: " Ventas, Auditor " }), ["ventas", "auditor"]);

  assert.deepEqual(decideWriteAgent({ bodyAgent: "Julian", allowed: createAgentsFromEnv({}) }), {
    ok: true,
    agent: "julian",
  });
  assert.deepEqual(decideWriteAgent({ headerAgent: "VENTAS", allowed: createAgentsFromEnv({}) }), {
    ok: true,
    agent: "ventas",
  });

  const deniedCreate = decideWriteAgent({
    bodyAgent: "auditor",
    allowed: createAgentsFromEnv({}),
    deniedMessage: "Este agente no puede crear leads.",
  });
  assert.equal(deniedCreate.ok, false);
  if (!deniedCreate.ok) {
    assert.equal(deniedCreate.status, 403);
    assert.equal(deniedCreate.error, "Este agente no puede crear leads.");
  }

  const deniedPatch = decideWriteAgent({ bodyAgent: "julian", allowed: writeAgentsFromEnv({}) });
  assert.equal(deniedPatch.ok, false);
  if (!deniedPatch.ok) assert.equal(deniedPatch.error, "Este agente no puede modificar leads.");

  const explicit = decideWriteAgent({
    bodyAgent: "julian",
    allowed: createAgentsFromEnv({ AUTOMATION_WRITE_AGENTS: "ventas,seguimiento" }),
    deniedMessage: "Este agente no puede crear leads.",
  });
  assert.equal(explicit.ok, false);
});

test("crea el lead en NUEVO, normaliza el teléfono y lo devuelve el GET con email", async () => {
  const { client, db } = memoryAdmin({
    lead_lists: [{ id: LIST_ID, owner_id: OWNER, name: "Dentistas Rosario" }],
  });

  const created = await createLeadForAutomation(client, OWNER, "julian", {
    name: "Acme",
    city: "Rosario",
    website: "https://acme.com",
    email: "hola@acme.com",
    phone: "+54 9 11 5555-6666",
    notes: "Llegó por el formulario.",
    listRef: "dentistas rosario",
  });

  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(CREATE_LEAD_ACTIVITY_TYPE, "NOTA");
  assert.equal(createLeadActivityContent("julian"), "[julian] lead creado vía API");
  assert.equal(created.agent, "julian");
  assert.deepEqual(created.activity, { type: "NOTA", content: "[julian] lead creado vía API" });
  assert.equal(created.lead.email, "hola@acme.com");
  assert.equal(created.lead.phone, "+5491155556666");
  assert.equal(created.lead.phoneE164, "+5491155556666");
  assert.equal(created.lead.status, "NUEVO");
  assert.equal(created.lead.city, "Rosario");
  assert.equal(created.lead.notes, "Llegó por el formulario.");
  assert.equal(created.lead.lastContactedAt, null);
  assert.deepEqual(created.lead.list, { id: LIST_ID, name: "Dentistas Rosario" });

  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].owner_id, OWNER);
  assert.equal(db.leads[0].status, "NUEVO");
  assert.equal(db.leads[0].dedupe_key, "phone:+5491155556666");
  assert.equal(db.leads[0].email, "hola@acme.com");
  assert.equal(db.leads[0].lead_list_id, LIST_ID);
  assert.equal(db.leads[0].last_contacted_at, null);
  assert.equal(db.lead_activities.length, 1);
  assert.equal(db.lead_activities[0].owner_id, OWNER);
  assert.equal(db.lead_activities[0].lead_id, created.lead.id);
  assert.equal(db.lead_activities[0].type, "NOTA");
  assert.equal(db.lead_activities[0].content, "[julian] lead creado vía API");

  const parsed = listLeadsQuerySchema.safeParse({});
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  const queue = await listLeadsForAutomation(client, OWNER, parsed.data);
  assert.equal(queue.leads.length, 1);
  assert.equal(queue.leads[0].id, created.lead.id);
  assert.equal(queue.leads[0].email, "hola@acme.com");

  const detail = await getLeadForAutomation(client, OWNER, created.lead.id);
  assert.ok(detail);
  assert.equal(detail.lead.email, "hola@acme.com");
  assert.equal(detail.activities.length, 1);
  assert.equal(detail.activities[0].type, "NOTA");
  assert.equal(detail.activities[0].content, "[julian] lead creado vía API");
});

test("un lead sólo con email se lee por id y en la cola si se pide sin teléfono", async () => {
  const { client } = memoryAdmin();
  const created = await createLeadForAutomation(client, OWNER, "ventas", {
    name: "Sin teléfono",
    city: null,
    website: null,
    email: "hola@acme.com",
    phone: null,
    notes: null,
    listRef: null,
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const detail = await getLeadForAutomation(client, OWNER, created.lead.id);
  assert.ok(detail);
  assert.equal(detail.lead.email, "hola@acme.com");
  assert.equal(detail.lead.phone, null);

  const defaults = listLeadsQuerySchema.safeParse({});
  assert.equal(defaults.success, true);
  if (!defaults.success) return;
  const hidden = await listLeadsForAutomation(client, OWNER, defaults.data);
  assert.equal(hidden.leads.length, 0);

  const open = listLeadsQuerySchema.safeParse({ has_phone: "false" });
  assert.equal(open.success, true);
  if (!open.success) return;
  const visible = await listLeadsForAutomation(client, OWNER, open.data);
  assert.equal(visible.leads.length, 1);
  assert.equal(visible.leads[0].email, "hola@acme.com");
});

test("409 con el id existente por teléfono, email o nombre y ciudad, y no escribe", async () => {
  const phoneLead = lead({
    id: EXISTING_ID,
    name: "Acme teléfono",
    phone: "+5491155556666",
    dedupe_key: "phone:+5491155556666",
    email: "otro@acme.com",
    city: "Córdoba",
  });
  const { client, db } = memoryAdmin({ leads: [phoneLead] });
  const byPhone = await createLeadForAutomation(client, OWNER, "ventas", input({ phone: "5491155556666" }));
  assert.equal(byPhone.ok, false);
  if (byPhone.ok || byPhone.reason !== "conflict") return;
  assert.equal(byPhone.id, EXISTING_ID);
  assert.match(byPhone.message, /teléfono/i);
  assert.equal(db.leads.length, 1);
  assert.equal(db.lead_activities.length, 0);

  const emailLead = lead({
    id: EXISTING_ID,
    name: "Acme mail",
    email: "hola@acme.com",
    phone: "+5491100000000",
    dedupe_key: "phone:+5491100000000",
    city: "Córdoba",
  });
  const emailDb = memoryAdmin({ leads: [emailLead] });
  const byEmail = await createLeadForAutomation(emailDb.client, OWNER, "ventas", input({ email: "Hola@Acme.com" }));
  assert.equal(byEmail.ok, false);
  if (byEmail.ok || byEmail.reason !== "conflict") return;
  assert.equal(byEmail.id, EXISTING_ID);
  assert.match(byEmail.message, /email/i);
  assert.equal(emailDb.db.leads.length, 1);

  const named = lead({
    id: EXISTING_ID,
    name: "Acme",
    city: "Rosario",
    phone: "+5491100000000",
    dedupe_key: "phone:+5491100000000",
    email: "otro@acme.com",
  });
  const nameDb = memoryAdmin({ leads: [named] });
  const byName = await createLeadForAutomation(
    nameDb.client,
    OWNER,
    "seguimiento",
    input({ name: "acme", city: "rosario", phone: "+5491199999999", email: "nuevo@acme.com" }),
  );
  assert.equal(byName.ok, false);
  if (byName.ok || byName.reason !== "conflict") return;
  assert.equal(byName.id, EXISTING_ID);
  assert.match(byName.message, /ciudad/i);
  assert.equal(nameDb.db.leads.length, 1);

  const site = lead({
    id: EXISTING_ID,
    name: "Otra marca",
    website: "https://www.acme.com.ar/inicio",
    dedupe_key: "domain:acme.com.ar",
    city: null,
    phone: null,
    email: null,
  });
  const siteDb = memoryAdmin({ leads: [site] });
  const bySite = await createLeadForAutomation(
    siteDb.client,
    OWNER,
    "ventas",
    input({ name: "Acme nueva", website: "acme.com.ar", city: null, phone: null, email: null }),
  );
  assert.equal(bySite.ok, false);
  if (bySite.ok || bySite.reason !== "conflict") return;
  assert.equal(bySite.id, EXISTING_ID);
  assert.match(bySite.message, /sitio/i);
});

test("el mismo email de otro owner no choca, y una lista ajena o repetida no se usa", async () => {
  const foreign = lead({
    id: EXISTING_ID,
    owner_id: OTHER,
    email: "hola@acme.com",
    dedupe_key: "slug:acme-",
  });
  const { client, db } = memoryAdmin({
    leads: [foreign],
    lead_lists: [
      { id: LIST_ID, owner_id: OTHER, name: "Ajena" },
      { id: "44444444-4444-4444-8444-444444444444", owner_id: OWNER, name: "Repetida" },
      { id: "55555555-5555-4555-8555-555555555555", owner_id: OWNER, name: "Repetida" },
    ],
  });

  const created = await createLeadForAutomation(client, OWNER, "julian", input({ email: "hola@acme.com" }));
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.lead.email, "hola@acme.com");
  assert.equal(db.leads.filter((row) => row.owner_id === OWNER).length, 1);

  const missing = await createLeadForAutomation(client, OWNER, "julian", input({ listRef: "No existe" }));
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.reason, "invalid_list");

  const foreignList = await createLeadForAutomation(client, OWNER, "julian", input({ listRef: LIST_ID }));
  assert.equal(foreignList.ok, false);
  if (!foreignList.ok) assert.equal(foreignList.reason, "invalid_list");

  const ambiguous = await createLeadForAutomation(client, OWNER, "julian", input({ listRef: "repetida" }));
  assert.equal(ambiguous.ok, false);
  if (!ambiguous.ok) assert.match(ambiguous.message, /id/);
  assert.equal(db.leads.filter((row) => row.owner_id === OWNER).length, 1);
});

test("si el historial no se puede anotar, no queda el lead", async () => {
  const { client, db } = memoryAdmin({ failActivities: true });
  const created = await createLeadForAutomation(client, OWNER, "ventas", input());
  assert.equal(created.ok, false);
  if (!created.ok) assert.equal(created.reason, "error");
  assert.equal(db.leads.length, 0);
  assert.equal(db.lead_activities.length, 0);
});

test("un choque de dedupe en el insert responde 409 con el id que ya estaba", async () => {
  const client = scripted([
    { table: "leads", result: { data: null, error: null } },
    { table: "leads", result: { data: null, error: { code: "23505" } } },
    { table: "leads", result: { data: { id: EXISTING_ID, name: "Acme viejo" }, error: null } },
  ]);
  const created = await createLeadForAutomation(client, OWNER, "ventas", input());
  assert.equal(created.ok, false);
  if (created.ok || created.reason !== "conflict") return;
  assert.equal(created.id, EXISTING_ID);
  assert.match(created.message, /nombre/i);
});

function input(overrides = {}) {
  return {
    name: "Acme",
    city: null,
    website: null,
    email: null,
    phone: null,
    notes: null,
    listRef: null,
    ...overrides,
  };
}

function lead(overrides = {}) {
  return {
    id: EXISTING_ID,
    owner_id: OWNER,
    name: "Acme",
    phone: null,
    email: null,
    status: "NUEVO",
    city: null,
    website: null,
    notes: null,
    dedupe_key: "slug:acme-",
    lead_list_id: null,
    industry_id: null,
    sales_angle: null,
    interest_level: null,
    last_contacted_at: null,
    next_action_at: null,
    instagram_url: null,
    created_at: "2026-10-01T12:00:00.000Z",
    updated_at: "2026-10-01T12:00:00.000Z",
    ...overrides,
  };
}

function ilikeMatch(value, pattern) {
  let source = "^";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i];
    if (char === "\\" && i + 1 < pattern.length) {
      source += pattern[i + 1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      i++;
    } else if (char === "%") source += ".*";
    else if (char === "_") source += ".";
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`${source}$`, "i").test(String(value ?? ""));
}

function memoryAdmin({ leads = [], lead_lists = [], failActivities = false } = {}) {
  const db = {
    leads: leads.map((row) => ({ ...row })),
    lead_lists: lead_lists.map((row) => ({ ...row })),
    lead_activities: [],
    lead_messages: [],
    industries: [],
  };

  function from(table) {
    const filters = [];
    let mode = "select";
    let pending = null;
    let orderBy = null;
    let limitN = null;

    const builder = {
      select() {
        return builder;
      },
      eq(column, value) {
        filters.push({ type: "eq", column, value });
        return builder;
      },
      in(column, value) {
        filters.push({ type: "in", column, value });
        return builder;
      },
      is(column, value) {
        filters.push({ type: "is", column, value });
        return builder;
      },
      neq(column, value) {
        filters.push({ type: "neq", column, value });
        return builder;
      },
      not(column, operator, value) {
        filters.push({ type: "not", column, operator, value });
        return builder;
      },
      ilike(column, value) {
        filters.push({ type: "ilike", column, value });
        return builder;
      },
      order(column, options) {
        orderBy = { column, ascending: options?.ascending !== false };
        return builder;
      },
      limit(value) {
        limitN = value;
        return builder;
      },
      insert(row) {
        mode = "insert";
        pending = row;
        return builder;
      },
      delete() {
        mode = "delete";
        return builder;
      },
      maybeSingle() {
        return Promise.resolve(run(true));
      },
      single() {
        return Promise.resolve(run(true));
      },
      then(resolve, reject) {
        return Promise.resolve(run(false)).then(resolve, reject);
      },
    };

    function matches(row) {
      return filters.every((filter) => {
        const cell = row[filter.column];
        if (filter.type === "eq") return cell === filter.value;
        if (filter.type === "in") return filter.value.includes(cell);
        if (filter.type === "is") return filter.value === null ? cell == null : cell === filter.value;
        if (filter.type === "neq") return cell !== filter.value;
        if (filter.type === "not") return filter.operator === "is" && filter.value === null ? cell != null : true;
        if (filter.type === "ilike") return ilikeMatch(cell, filter.value);
        return false;
      });
    }

    function run(singleRow) {
      if (mode === "insert") {
        if (table === "lead_activities" && failActivities) {
          return { data: null, error: { message: "fail" }, count: 0 };
        }
        const row = {
          id: crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          occurred_at: new Date().toISOString(),
          from_status: null,
          to_status: null,
          content: null,
          ...pending,
        };
        if (table === "leads" && row.status == null) row.status = "NUEVO";
        if (table === "leads" && db.leads.some((item) => item.owner_id === row.owner_id && item.dedupe_key === row.dedupe_key)) {
          return { data: null, error: { code: "23505" }, count: 0 };
        }
        db[table].push(row);
        const visible = present(table, row);
        return { data: singleRow ? visible : [visible], error: null, count: 1 };
      }

      if (mode === "delete") {
        const kept = [];
        const removed = [];
        for (const row of db[table]) {
          if (matches(row)) removed.push(row);
          else kept.push(row);
        }
        db[table] = kept;
        return { data: removed.map((row) => present(table, row)), error: null, count: removed.length };
      }

      let rows = db[table].filter(matches);
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows = [...rows].sort((left, right) => String(left[column] ?? "").localeCompare(String(right[column] ?? "")) * (ascending ? 1 : -1));
      }
      const count = rows.length;
      if (limitN != null) rows = rows.slice(0, limitN);
      const visible = rows.map((row) => present(table, row));
      if (!singleRow) return { data: visible, error: null, count };
      return { data: visible[0] ?? null, error: null, count };
    }

    return builder;
  }

  function present(table, row) {
    if (table !== "leads") return row;
    const list = db.lead_lists.find((item) => item.id === row.lead_list_id) ?? null;
    const industry = db.industries.find((item) => item.id === row.industry_id) ?? null;
    return {
      ...row,
      industries: industry ? { id: industry.id, name: industry.name } : null,
      lead_lists: list ? { id: list.id, name: list.name } : null,
    };
  }

  return { client: { from }, db };
}

function scripted(steps) {
  let index = 0;
  return {
    from(table) {
      const step = steps[index++];
      if (!step) throw new Error(`query de más sobre ${table}`);
      assert.equal(step.table, table);
      const builder = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") return (resolve, reject) => Promise.resolve(step.result).then(resolve, reject);
            if (prop === "maybeSingle" || prop === "single") return () => Promise.resolve(step.result);
            return () => builder;
          },
        },
      );
      return builder;
    },
  };
}
