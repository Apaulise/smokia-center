import assert from "node:assert/strict";
import { test } from "node:test";

import { getLeadForAutomation, listLeadsForAutomation, listLeadsQuerySchema } from "../lib/automation/leads.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const LEAD_KEYS = [
  "id",
  "name",
  "phone",
  "phoneE164",
  "email",
  "status",
  "city",
  "industry",
  "list",
  "salesAngle",
  "interestLevel",
  "lastContactedAt",
  "nextActionAt",
  "notes",
  "instagramUrl",
  "website",
  "createdAt",
];

function leadRow(overrides = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Acme",
    phone: "+5491112345678",
    email: "hola@acme.com",
    status: "NUEVO",
    city: "Rosario",
    sales_angle: null,
    interest_level: null,
    last_contacted_at: null,
    next_action_at: null,
    notes: null,
    instagram_url: null,
    website: "https://acme.com",
    created_at: "2026-10-01T12:00:00.000Z",
    industries: { id: "22222222-2222-4222-8222-222222222222", name: "Gimnasios" },
    lead_lists: { id: "33333333-3333-4333-8333-333333333333", name: "Rosario octubre" },
    ...overrides,
  };
}

/** Query builder mínimo: registra el select y resuelve como el cliente de Supabase. */
function query(result) {
  const calls = [];
  const builder = {
    select(columns, options) {
      calls.push({ method: "select", columns, options });
      return builder;
    },
    eq(column, value) {
      calls.push({ method: "eq", column, value });
      return builder;
    },
    in(column, value) {
      calls.push({ method: "in", column, value });
      return builder;
    },
    is(column, value) {
      calls.push({ method: "is", column, value });
      return builder;
    },
    not(column, operator, value) {
      calls.push({ method: "not", column, operator, value });
      return builder;
    },
    neq(column, value) {
      calls.push({ method: "neq", column, value });
      return builder;
    },
    order(column, options) {
      calls.push({ method: "order", column, options });
      return builder;
    },
    limit(value) {
      calls.push({ method: "limit", value });
      return builder;
    },
    maybeSingle() {
      calls.push({ method: "maybeSingle" });
      return Promise.resolve(result);
    },
    then(resolve, reject) {
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return { builder, calls };
}

function adminWith(tables) {
  const queries = [];
  return {
    queries,
    client: {
      from(table) {
        const result = tables[table];
        if (!result) throw new Error(`tabla inesperada: ${table}`);
        const built = query(result);
        queries.push({ table, calls: built.calls });
        return built.builder;
      },
    },
  };
}

function selectedColumns(queries, table) {
  const match = queries.find((entry) => entry.table === table);
  assert.ok(match, `no hubo select de ${table}`);
  const select = match.calls.find((call) => call.method === "select");
  assert.ok(select, `no hubo select de ${table}`);
  return select.columns.split(", ").map((column) => column.trim());
}

test("la cola devuelve email y lo deja null o vacío cuando el lead no tiene", async () => {
  const withMail = leadRow();
  const withoutMail = leadRow({
    id: "44444444-4444-4444-8444-444444444444",
    name: "Sin mail",
    email: null,
  });
  const emptyMail = leadRow({
    id: "55555555-5555-4555-8555-555555555555",
    name: "Mail vacío",
    email: "",
  });
  const { client, queries } = adminWith({
    leads: { data: [withMail, withoutMail, emptyMail], error: null, count: 3 },
  });

  const parsed = listLeadsQuerySchema.safeParse({ uncontacted: "true", has_phone: "false" });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;

  const result = await listLeadsForAutomation(client, OWNER, parsed.data);

  assert.equal(result.total, 3);
  assert.equal(result.leads.length, 3);
  assert.deepEqual(Object.keys(result.leads[0]).sort(), [...LEAD_KEYS].sort());
  assert.equal(result.leads[0].email, "hola@acme.com");
  assert.equal(result.leads[0].phone, "+5491112345678");
  assert.equal(result.leads[0].phoneE164, "+5491112345678");
  assert.equal(result.leads[1].email, null);
  assert.equal(result.leads[1].name, "Sin mail");
  assert.equal(result.leads[2].email, "");
  assert.equal(result.leads[2].name, "Mail vacío");
  assert.equal(Object.hasOwn(result.leads[0], "raw"), false);
  assert.equal(Object.hasOwn(result.leads[0], "address"), false);
  assert.equal(Object.hasOwn(result.leads[0], "linkedinUrl"), false);

  const columns = selectedColumns(queries, "leads");
  assert.ok(columns.includes("email"));
  assert.equal(columns.filter((column) => column === "email").length, 1);
  const ownerFilter = queries[0].calls.find((call) => call.method === "eq" && call.column === "owner_id");
  assert.deepEqual(ownerFilter, { method: "eq", column: "owner_id", value: OWNER });
});

test("el detalle de un lead incluye email, también cuando es null", async () => {
  for (const email of ["hola@acme.com", null, ""]) {
    const row = leadRow({ email });
    const { client, queries } = adminWith({
      leads: { data: row, error: null },
      lead_activities: { data: [], error: null },
      lead_messages: { data: [], error: null },
    });

    const detail = await getLeadForAutomation(client, OWNER, row.id);
    assert.ok(detail);
    assert.equal(detail.lead.email, email);
    assert.deepEqual(Object.keys(detail.lead).sort(), [...LEAD_KEYS].sort());
    assert.deepEqual(detail.activities, []);
    assert.deepEqual(detail.messages, []);

    const columns = selectedColumns(queries, "leads");
    assert.ok(columns.includes("email"));
    const ownerFilter = queries[0].calls.find((call) => call.method === "eq" && call.column === "owner_id");
    assert.equal(ownerFilter.value, OWNER);
  }
});

test("si la lectura no encuentra el lead, el detalle es null", async () => {
  const { client } = adminWith({
    leads: { data: null, error: null },
  });

  const detail = await getLeadForAutomation(client, OWNER, "11111111-1111-4111-8111-111111111111");
  assert.equal(detail, null);
});
