import assert from "node:assert/strict";
import { test } from "node:test";

import { decideWriteAgent, intakeAgentsFromEnv, writeAgentsFromEnv } from "../lib/automation/agents.ts";
import {
  INSTAGRAM_ACQUISITION_SOURCE,
  instagramIntakeActivityContent,
  instagramIntakeBodySchema,
  normalizeInstagramHandle,
  toInstagramIntakeInput,
  upsertInstagramLead,
} from "../lib/automation/instagram-intake.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EXISTING_ID = "11111111-1111-4111-8111-111111111111";

function parse(body) {
  const parsed = instagramIntakeBodySchema.safeParse(body);
  if (!parsed.success) assert.fail(JSON.stringify(parsed.error.issues));
  return toInstagramIntakeInput(parsed.data);
}

const base = { manychat_id: "123", ig_username: "estudio.demo", stage: "respondio" };

test("el esquema rechaza campos desconocidos, body vacío y stage inválido", () => {
  const schema = instagramIntakeBodySchema;
  assert.equal(schema.safeParse({}).success, false);
  assert.equal(schema.safeParse({ stage: "respondio" }).success, false);
  assert.equal(schema.safeParse({ manychat_id: "1" }).success, false);
  assert.equal(schema.safeParse({ ...base, stage: "caliente" }).success, false);
  assert.equal(schema.safeParse({ ...base, stage: "" }).success, false);
  assert.equal(schema.safeParse({ ...base, status: "CALIFICADO" }).success, false);
  assert.equal(schema.safeParse({ ...base, utm: { source: "ig", raro: "x" } }).success, false);
  assert.equal(schema.safeParse({ ...base, rubro: "x".repeat(121) }).success, false);
  assert.equal(schema.safeParse({ manychat_id: "", ig_username: "", stage: "respondio" }).success, false);
  assert.equal(schema.safeParse({ ...base, ig_username: "no es un usuario" }).success, false);
  assert.equal(schema.safeParse({ manychat_id: "1", stage: "tibio" }).success, true);
  assert.equal(schema.safeParse({ ig_username: "estudio.demo", stage: "tibio" }).success, true);
});

test('las variables vacías de ManyChat ("") quedan en null y no viajan', () => {
  const input = parse({
    ...base,
    name: "",
    rubro: "salud",
    rubro_libre: "",
    tarea: "  ",
    keyword: "MOTION",
    pieza_origen: "DfC9JvfxG_Q",
    utm: { source: "instagram", medium: "", campaign: "motion" },
  });
  assert.equal(input.name, null);
  assert.deepEqual(input.fields, { rubro: "salud", keyword: "MOTION", pieza_origen: "DfC9JvfxG_Q" });
  assert.deepEqual(input.utm, { source: "instagram", campaign: "motion" });
  assert.equal(parse({ ...base, utm: "" }).utm.source, undefined);
});

test("normaliza @, mayúsculas y URLs con query", () => {
  assert.equal(normalizeInstagramHandle("@Estudio.Demo"), "estudio.demo");
  assert.equal(normalizeInstagramHandle("https://www.instagram.com/Estudio.Demo/?utm_source=ig"), "estudio.demo");
  assert.equal(normalizeInstagramHandle("instagram.com/estudio.demo#x"), "estudio.demo");
  assert.equal(normalizeInstagramHandle("  ESTUDIO_demo "), "estudio_demo");
  assert.equal(normalizeInstagramHandle("dos palabras"), null);
  assert.equal(normalizeInstagramHandle(""), null);
  assert.equal(parse({ ...base, ig_username: "@Estudio.Demo" }).handle, "estudio.demo");
});

test("crea un lead nuevo con origen Instagram orgánico y una actividad NOTA", async () => {
  const { client, db } = memoryAdmin();
  const input = parse({
    ...base,
    name: "Sofía Pérez",
    stage: "calificado",
    rubro: "salud",
    keyword: "MOTION",
    pieza_origen: "DfC9JvfxG_Q",
    utm: { source: "instagram" },
  });
  const result = await upsertInstagramLead(client, OWNER, "manychat", input);

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, true);
  assert.deepEqual(result.changed, []);
  assert.equal(result.activity.type, "NOTA");
  assert.equal(result.activity.content, "[manychat] calificado vía MOTION (pieza DfC9JvfxG_Q)");
  assert.equal(instagramIntakeActivityContent("manychat", parse(base)), "[manychat] respondio");

  assert.equal(db.leads.length, 1);
  const row = db.leads[0];
  assert.equal(row.owner_id, OWNER);
  assert.equal(row.name, "Sofía Pérez");
  assert.equal(row.status, "CALIFICADO");
  assert.equal(row.acquisition_source, INSTAGRAM_ACQUISITION_SOURCE);
  assert.equal(row.instagram_url, "https://instagram.com/estudio.demo");
  assert.equal(db.lead_lists.length, 1);
  assert.equal(db.lead_lists[0].name, "Instagram orgánico");
  assert.equal(db.lead_lists[0].owner_id, OWNER);
  assert.equal(row.lead_list_id, db.lead_lists[0].id);
  assert.equal(row.dedupe_key, "instagram:estudio.demo");
  assert.equal(row.intake.manychat_id, "123");
  assert.equal(row.intake.stage, "calificado");
  assert.equal(row.intake.rubro, "salud");
  assert.deepEqual(row.intake.utm, { source: "instagram" });
  assert.equal(db.lead_activities.length, 1);
  assert.equal(db.lead_activities[0].owner_id, OWNER);
  assert.equal(db.lead_activities[0].type, "NOTA");
});

test("la lista Instagram orgánico se crea una vez, se reutiliza y no se toma la de otro owner", async () => {
  const { client, db } = memoryAdmin({ lists: [{ id: "99999999-9999-4999-8999-999999999999", owner_id: OTHER, name: "Instagram orgánico" }] });
  await upsertInstagramLead(client, OWNER, "manychat", parse(base));
  await upsertInstagramLead(client, OWNER, "manychat", parse({ manychat_id: "2", ig_username: "otra.cuenta", stage: "tibio" }));
  const mine = db.lead_lists.filter((l) => l.owner_id === OWNER);
  assert.equal(mine.length, 1);
  assert.equal(db.lead_lists.length, 2);
  assert.ok(db.leads.every((l) => l.lead_list_id === mine[0].id));
});

test("sin nombre usa @usuario; sin usuario usa manychat:<id> y un nombre de respaldo", async () => {
  const withHandle = memoryAdmin();
  await upsertInstagramLead(withHandle.client, OWNER, "manychat", parse(base));
  assert.equal(withHandle.db.leads[0].name, "@estudio.demo");

  const onlyId = memoryAdmin();
  const result = await upsertInstagramLead(onlyId.client, OWNER, "manychat", parse({ manychat_id: "777", stage: "tibio" }));
  assert.equal(result.ok, true);
  assert.equal(onlyId.db.leads[0].dedupe_key, "manychat:777");
  assert.equal(onlyId.db.leads[0].instagram_url, null);
  assert.equal(onlyId.db.leads[0].status, "RESPONDIO");
  assert.equal(onlyId.db.leads[0].intake.stage, "tibio");
});

test("la segunda llamada con el mismo manychat_id no duplica y sube de estado", async () => {
  const { client, db } = memoryAdmin();
  const first = await upsertInstagramLead(client, OWNER, "manychat", parse({ ...base, rubro: "salud" }));
  assert.equal(first.ok && first.created, true);

  const second = await upsertInstagramLead(
    client,
    OWNER,
    "manychat",
    parse({ ...base, stage: "calificado", tarea: "consultas", rubro: "" }),
  );
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.created, false);
  assert.deepEqual(second.changed.sort(), ["intake", "status"]);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].status, "CALIFICADO");
  assert.equal(db.leads[0].intake.rubro, "salud", "una variable vacía no borra lo que ya había");
  assert.equal(db.leads[0].intake.tarea, "consultas");
  assert.equal(db.lead_activities.filter((a) => a.type === "CAMBIO_ESTADO").length, 1);
  assert.equal(db.lead_activities.filter((a) => a.type === "NOTA").length, 2);

  // Una llamada repetida sin novedades no cambia nada, pero deja su nota.
  const third = await upsertInstagramLead(client, OWNER, "manychat", parse({ ...base, stage: "calificado" }));
  assert.equal(third.ok && third.changed.length, 0);
  assert.equal(db.leads.length, 1);
});

test("encuentra el lead por manychat_id aunque el @ haya cambiado", async () => {
  const { client, db } = memoryAdmin();
  await upsertInstagramLead(client, OWNER, "manychat", parse(base));
  const again = await upsertInstagramLead(client, OWNER, "manychat", parse({ ...base, ig_username: "nuevo.nombre" }));
  assert.equal(again.ok && again.created, false);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].intake.ig_username, "nuevo.nombre");
});

test("un lead de prospección en frío con el mismo @ se enriquece y no se duplica", async () => {
  const cold = lead({
    id: EXISTING_ID,
    name: "Estudio Demo",
    status: "CONTACTADO",
    instagram_url: "https://www.instagram.com/Estudio.Demo/?hl=es",
    dedupe_key: "phone:+5491155556666",
    phone: "+5491155556666",
    lead_list_id: "33333333-3333-4333-8333-333333333333",
  });
  const { client, db } = memoryAdmin({ leads: [cold] });
  const result = await upsertInstagramLead(
    client,
    OWNER,
    "manychat",
    parse({ ...base, ig_username: "@estudio.demo", stage: "calificado", pieza_origen: "P1" }),
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.created, false);
  assert.equal(result.lead.id, EXISTING_ID);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].status, "CALIFICADO");
  assert.equal(db.leads[0].name, "Estudio Demo");
  assert.equal(db.leads[0].phone, "+5491155556666");
  assert.equal(db.leads[0].lead_list_id, "33333333-3333-4333-8333-333333333333");
  assert.equal(db.leads[0].instagram_url, "https://www.instagram.com/Estudio.Demo/?hl=es", "no pisa el @ que ya estaba");
  assert.equal(db.leads[0].intake.pieza_origen, "P1");
  assert.equal(db.leads[0].acquisition_source, null, "el origen histórico no se reescribe");
  assert.ok(db.lead_activities.some((a) => a.type === "CAMBIO_ESTADO" && a.from_status === "CONTACTADO"));
});

test("un @ parecido no cuenta como el mismo (estudio.demo vs estudio.demo2)", async () => {
  const other = lead({ id: EXISTING_ID, instagram_url: "https://instagram.com/estudio.demo2", dedupe_key: "slug:otro" });
  const { client, db } = memoryAdmin({ leads: [other] });
  const result = await upsertInstagramLead(client, OWNER, "manychat", parse(base));
  assert.equal(result.ok && result.created, true);
  assert.equal(db.leads.length, 2);
});

test("no retrocede: un lead en REUNION_AGENDADA conserva el estado y actualiza intake", async () => {
  const advanced = lead({
    id: EXISTING_ID,
    status: "REUNION_AGENDADA",
    instagram_url: "https://instagram.com/estudio.demo",
    dedupe_key: "instagram:estudio.demo",
    intake: { manychat_id: "123", stage: "calificado" },
  });
  const { client, db } = memoryAdmin({ leads: [advanced] });
  const result = await upsertInstagramLead(client, OWNER, "manychat", parse({ ...base, stage: "respondio", volumen: "10 a 30" }));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.changed, ["intake"]);
  assert.equal(db.leads[0].status, "REUNION_AGENDADA");
  assert.equal(db.leads[0].intake.volumen, "10 a 30");
  assert.equal(db.leads[0].intake.stage, "calificado", "la etapa del flujo tampoco baja");
  assert.equal(db.lead_activities.filter((a) => a.type === "CAMBIO_ESTADO").length, 0);
  assert.equal(db.lead_activities.filter((a) => a.type === "NOTA").length, 1);
});

test("nunca pone un estado de reunión, ni siquiera con calificado", async () => {
  const { client, db } = memoryAdmin();
  for (const stage of ["respondio", "tibio", "calificado"]) {
    await upsertInstagramLead(client, OWNER, "manychat", parse({ ...base, manychat_id: stage, ig_username: stage, stage }));
  }
  assert.ok(db.leads.every((row) => !row.status.startsWith("REUNION")));
});

test("aislamiento: un lead de otro owner con el mismo @ o manychat_id nunca se toca", async () => {
  const foreign = lead({
    id: EXISTING_ID,
    owner_id: OTHER,
    status: "NUEVO",
    instagram_url: "https://instagram.com/estudio.demo",
    dedupe_key: "instagram:estudio.demo",
    intake: { manychat_id: "123" },
  });
  const { client, db } = memoryAdmin({ leads: [foreign] });
  const result = await upsertInstagramLead(client, OWNER, "manychat", parse({ ...base, stage: "calificado" }));
  assert.equal(result.ok && result.created, true);

  const theirs = db.leads.find((row) => row.owner_id === OTHER);
  assert.equal(theirs.status, "NUEVO");
  assert.deepEqual(theirs.intake, { manychat_id: "123" });
  assert.equal(db.leads.filter((row) => row.owner_id === OWNER).length, 1);
  assert.ok(db.lead_activities.every((a) => a.owner_id === OWNER));
});

test("si el historial no se puede anotar al crear, no queda el lead", async () => {
  const { client, db } = memoryAdmin({ failActivities: true });
  const result = await upsertInstagramLead(client, OWNER, "manychat", parse(base));
  assert.equal(result.ok, false);
  assert.equal(db.leads.length, 0);
});

test("manychat sólo puede usar este endpoint: no está en las listas de escritura", () => {
  assert.deepEqual(intakeAgentsFromEnv({}), ["manychat"]);
  assert.deepEqual(intakeAgentsFromEnv({ AUTOMATION_INTAKE_AGENTS: "  " }), ["manychat"]);
  assert.deepEqual(intakeAgentsFromEnv({ AUTOMATION_INTAKE_AGENTS: " ManyChat, otro " }), ["manychat", "otro"]);
  assert.equal(writeAgentsFromEnv({}).includes("manychat"), false);

  assert.deepEqual(decideWriteAgent({ headerAgent: "ManyChat", allowed: intakeAgentsFromEnv({}) }), {
    ok: true,
    agent: "manychat",
  });
  const denied = decideWriteAgent({ headerAgent: "ventas", allowed: intakeAgentsFromEnv({}) });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 403);
  const missing = decideWriteAgent({ allowed: intakeAgentsFromEnv({}) });
  assert.equal(missing.ok, false);
});

test("la ruta responde 401 sin Bearer y 403 con un agente no permitido", async () => {
  const { POST } = await import("../app/api/automation/leads/instagram/route.ts");
  const previous = { secret: process.env.AUTOMATION_API_SECRET, owner: process.env.AUTOMATION_OWNER_ID, intake: process.env.AUTOMATION_INTAKE_AGENTS };
  process.env.AUTOMATION_API_SECRET = "s".repeat(40);
  process.env.AUTOMATION_OWNER_ID = OWNER;
  delete process.env.AUTOMATION_INTAKE_AGENTS;
  try {
    const request = (headers) =>
      new Request("http://localhost/api/automation/leads/instagram", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(base),
      });

    assert.equal((await POST(request({}))).status, 401);
    assert.equal((await POST(request({ authorization: "Bearer incorrecto" }))).status, 401);
    const auth = { authorization: `Bearer ${"s".repeat(40)}` };
    assert.equal((await POST(request({ ...auth, "x-agent": "ventas" }))).status, 403);
    assert.equal((await POST(request(auth))).status, 400);
  } finally {
    for (const [key, value] of [
      ["AUTOMATION_API_SECRET", previous.secret],
      ["AUTOMATION_OWNER_ID", previous.owner],
      ["AUTOMATION_INTAKE_AGENTS", previous.intake],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

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
    acquisition_source: null,
    intake: null,
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

/** Lee `intake->>clave` como lo hace PostgREST. */
function cellOf(row, column) {
  const match = /^(\w+)->>(\w+)$/.exec(column);
  if (!match) return row[column];
  const value = row[match[1]]?.[match[2]];
  return value == null ? null : String(value);
}

function memoryAdmin({ leads = [], lists = [], failActivities = false } = {}) {
  const db = {
    leads: leads.map((row) => ({ ...row })),
    lead_lists: lists.map((row) => ({ ...row, created_at: "2026-10-01T12:00:00.000Z" })),
    lead_activities: [],
    lead_messages: [],
    industries: [],
    appointments: [],
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
      update(patch) {
        mode = "update";
        pending = patch;
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
        const cell = cellOf(row, filter.column);
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
        const visible = presented(table, row);
        return { data: singleRow ? visible : [visible], error: null, count: 1 };
      }

      if (mode === "update") {
        const touched = db[table].filter(matches);
        for (const row of touched) Object.assign(row, pending, { updated_at: new Date().toISOString() });
        return { data: touched.map((row) => presented(table, row)), error: null, count: touched.length };
      }

      if (mode === "delete") {
        const kept = [];
        const removed = [];
        for (const row of db[table]) {
          if (matches(row)) removed.push(row);
          else kept.push(row);
        }
        db[table] = kept;
        return { data: removed.map((row) => presented(table, row)), error: null, count: removed.length };
      }

      let rows = db[table].filter(matches);
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows = [...rows].sort((left, right) => String(left[column] ?? "").localeCompare(String(right[column] ?? "")) * (ascending ? 1 : -1));
      }
      const count = rows.length;
      if (limitN != null) rows = rows.slice(0, limitN);
      const visible = rows.map((row) => presented(table, row));
      if (!singleRow) return { data: visible, error: null, count };
      return { data: visible[0] ?? null, error: null, count };
    }

    return builder;
  }

  function presented(table, row) {
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
