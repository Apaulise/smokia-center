import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { applyCalBooking, parseCalWebhook } from "../lib/automation/cal-booking.ts";
import { forwardStatus } from "../lib/automation/lead-progress.ts";
import { headerSignature, readWebhookSecret, webhookAuthorized } from "../lib/automation/webhook-signature.ts";
import { applyZernioCrmEvent, parseZernioCrmBody, qualifyingTagStatus } from "../lib/automation/zernio-crm.ts";
import { signBody } from "../lib/chats/webhook.ts";

const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function fixture(name) {
  return JSON.parse(readFileSync(new URL(`./fixtures/crm-webhooks/${name}`, import.meta.url), "utf8"));
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

function cellOf(row, column) {
  const match = /^(\w+)->>(\w+)$/.exec(column);
  if (!match) return row[column];
  const value = row[match[1]]?.[match[2]];
  return value == null ? null : String(value);
}

function memoryAdmin(seed = {}) {
  const db = {
    leads: (seed.leads ?? []).map((row) => ({ intake: null, acquisition_source: null, email: null, phone: null, instagram_url: null, lead_list_id: null, ...row })),
    lead_lists: (seed.lists ?? []).map((row) => ({ ...row, created_at: row.created_at ?? "2026-10-01T12:00:00.000Z" })),
    lead_activities: [],
    lead_messages: [],
    industries: [],
    appointments: [],
    conversations: (seed.conversations ?? []).map((row) => ({
      tags: [],
      lead_id: null,
      source_automation_id: null,
      zernio_contact_id: null,
      participant_handle: null,
      participant_name: null,
      participant_external_id: null,
      ...row,
    })),
    content_automations: seed.automations ?? [],
    automation_runs: [],
    webhook_deliveries: [],
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
        if (filter.type === "not") return filter.operator === "is" && filter.value === null ? cell != null : true;
        if (filter.type === "ilike") return ilikeMatch(cell, filter.value);
        return false;
      });
    }

    function conflict(row) {
      if (table === "leads" && db.leads.some((item) => item.owner_id === row.owner_id && item.dedupe_key === row.dedupe_key)) return true;
      if (
        table === "webhook_deliveries" &&
        db.webhook_deliveries.some((item) => item.owner_id === row.owner_id && item.provider === row.provider && item.event_id === row.event_id)
      ) {
        return true;
      }
      if (
        table === "automation_runs" &&
        db.automation_runs.some((item) => item.owner_id === row.owner_id && item.zernio_execution_id === row.zernio_execution_id)
      ) {
        return true;
      }
      if (
        table === "appointments" &&
        row.external_uid &&
        db.appointments.some(
          (item) => item.owner_id === row.owner_id && item.external_provider === row.external_provider && item.external_uid === row.external_uid,
        )
      ) {
        return true;
      }
      return false;
    }

    function run(singleRow) {
      if (!db[table]) return { data: null, error: { code: "42P01", message: `relation ${table} does not exist` }, count: 0 };
      if (mode === "insert") {
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
        if (conflict(row)) return { data: null, error: { code: "23505" }, count: 0 };
        db[table].push(row);
        const visible = presented(table, row);
        return { data: singleRow ? visible : [visible], error: null, count: 1 };
      }
      if (mode === "update") {
        const touched = db[table].filter(matches);
        for (const row of touched) Object.assign(row, pending, { updated_at: new Date().toISOString() });
        const visible = touched.map((row) => presented(table, row));
        return { data: singleRow ? (visible[0] ?? null) : visible, error: null, count: touched.length };
      }
      if (mode === "delete") {
        const kept = [];
        const removed = [];
        for (const row of db[table]) (matches(row) ? removed : kept).push(row);
        db[table] = kept;
        return { data: removed, error: null, count: removed.length };
      }
      let rows = db[table].filter(matches);
      if (orderBy) {
        const { column, ascending } = orderBy;
        rows = [...rows].sort((left, right) => String(left[column] ?? "").localeCompare(String(right[column] ?? "")) * (ascending ? 1 : -1));
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      const visible = rows.map((row) => presented(table, row));
      if (!singleRow) return { data: visible, error: null, count: rows.length };
      return { data: visible[0] ?? null, error: null, count: rows.length };
    }

    return builder;
  }

  function presented(table, row) {
    if (table !== "leads") return row;
    const list = db.lead_lists.find((item) => item.id === row.lead_list_id) ?? null;
    return { ...row, industries: null, lead_lists: list ? { id: list.id, name: list.name } : null };
  }

  return { client: { from }, db };
}

test("la firma falla cerrada y acepta el HMAC del body crudo", () => {
  const secret = "a".repeat(32);
  const raw = JSON.stringify(fixture("zernio-tag-negocio.json"));
  assert.equal(readWebhookSecret({ ZERNIO_WEBHOOK_SECRET: "corto" }, "ZERNIO_WEBHOOK_SECRET"), null);
  assert.equal(readWebhookSecret({ ZERNIO_WEBHOOK_SECRET: secret }, "ZERNIO_WEBHOOK_SECRET"), secret);
  assert.equal(webhookAuthorized(raw, signBody(raw, secret), secret), true);
  assert.equal(webhookAuthorized(raw, signBody(raw, "b".repeat(32)), secret), false);
  assert.equal(webhookAuthorized(raw, null, secret), false);
  assert.equal(webhookAuthorized(raw, signBody(raw, secret), null), false);
  const headers = { get: (name) => (name === "x-cal-signature-256" ? "no-secret-provided" : null) };
  assert.equal(headerSignature(headers, ["x-cal-signature-256"]), null);
  const signed = createHmac("sha256", secret).update(raw).digest("hex");
  assert.equal(headerSignature({ get: () => signed }, ["x-cal-signature-256"]), signed);
});

test("negocio crea el lead orgánico, lo ata a la conversación y un reintento no duplica", async () => {
  const { client, db } = memoryAdmin({
    conversations: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        owner_id: OWNER,
        zernio_contact_id: "ct_100",
        zernio_conversation_id: "t_100",
        participant_handle: "estudio.demo",
        participant_name: "Sofía Pérez",
      },
    ],
  });
  const body = fixture("zernio-tag-negocio.json");
  const parsed = parseZernioCrmBody(body, "fallback");
  assert.equal(parsed.kind, "action");
  const first = await applyZernioCrmEvent(client, OWNER, parsed.action);
  assert.equal(first.ok && first.duplicate, false);
  assert.equal(first.created, true);
  assert.equal(first.status, "RESPONDIO");
  assert.equal(first.linkedConversations, 1);
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].acquisition_source, "instagram_organico");
  assert.equal(db.leads[0].instagram_url, "https://instagram.com/estudio.demo");
  assert.equal(db.leads[0].intake.zernio_contact_id, "ct_100");
  assert.equal(db.leads[0].intake.signal, "negocio");
  assert.equal(db.leads[0].dedupe_key, "instagram:estudio.demo");
  assert.equal(db.conversations[0].lead_id, db.leads[0].id);
  assert.deepEqual(db.conversations[0].tags, ["negocio"]);
  assert.equal(db.lead_lists[0].name, "Instagram orgánico");

  const second = await applyZernioCrmEvent(client, OWNER, parsed.action);
  assert.equal(second.ok && second.duplicate, true);
  assert.equal(db.leads.length, 1);
  assert.equal(db.lead_activities.length, 1);
});

test("la respuesta de tareas sube a diagnóstico y agenda no baja un lead cerrado", async () => {
  const { client, db } = memoryAdmin();
  const tarea = parseZernioCrmBody(fixture("zernio-field-tareas.json"), "fallback");
  const saved = await applyZernioCrmEvent(client, OWNER, tarea.action);
  assert.equal(saved.ok && saved.status, "DIAGNOSTICO");
  assert.equal(db.leads[0].intake.tarea, "responder consultas");

  const handoff = parseZernioCrmBody(
    { id: "evt_intervenir", event: "contact.tag_added", contact: { id: "ct_100" }, tag: "Intervenir" },
    "fallback",
  );
  const qualified = await applyZernioCrmEvent(client, OWNER, handoff.action);
  assert.equal(qualified.ok && qualified.status, "INTERESADO");
  assert.equal(db.leads.length, 1);
  assert.ok(db.leads[0].next_action_at);
  assert.ok(db.lead_activities.some((row) => row.content === "[zernio] intervenir: hay que responder a mano"));

  const agenda = parseZernioCrmBody(
    { id: "evt_agenda", event: "contact.tag_added", contact: { id: "ct_100", username: "@Estudio.Demo" }, tag: "agenda" },
    "fallback",
  );
  const booked = await applyZernioCrmEvent(client, OWNER, agenda.action);
  assert.equal(booked.ok && booked.status, "REUNION_PROPUESTA");

  db.leads[0].status = "CERRADO_GANADO";
  const again = parseZernioCrmBody(
    { id: "evt_negocio_tarde", event: "contact.tag_added", contact: { id: "ct_100", username: "estudio.demo" }, tag: "negocio" },
    "fallback",
  );
  const kept = await applyZernioCrmEvent(client, OWNER, again.action);
  assert.equal(kept.ok && kept.status, "CERRADO_GANADO");
  assert.equal(db.leads[0].status, "CERRADO_GANADO");
  assert.equal(qualifyingTagStatus("curioso"), null);
  assert.equal(qualifyingTagStatus("listo_agustin"), null);
  assert.deepEqual(qualifyingTagStatus("no-agenda"), { tag: "no_agenda", status: "CERRADO_PERDIDO" });
  assert.equal(qualifyingTagStatus("intervenir")?.status, "INTERESADO");
  assert.equal(parseZernioCrmBody({ event: "contact.tag_added", contact: { id: "ct_1" }, tag: "curioso" }, "x").kind, "ignore");
  assert.equal(forwardStatus("CERRADO_GANADO", "RESPONDIO"), null);
  assert.equal(forwardStatus("RESPONDIO", "DIAGNOSTICO"), "DIAGNOSTICO");
});

test("la corrida del workflow queda en automation_runs y marca la pieza", async () => {
  const automationId = "33333333-3333-4333-8333-333333333333";
  const { client, db } = memoryAdmin({
    conversations: [
      {
        id: "22222222-2222-4222-8222-222222222222",
        owner_id: OWNER,
        zernio_conversation_id: "t_100",
        participant_handle: "estudio.demo",
      },
    ],
    automations: [{ id: automationId, owner_id: OWNER, zernio_workflow_id: "wf_tofu_1", created_at: "2026-11-01T00:00:00.000Z" }],
  });
  const parsed = parseZernioCrmBody(fixture("zernio-workflow-run.json"), "fallback");
  const result = await applyZernioCrmEvent(client, OWNER, parsed.action);
  assert.equal(result.ok && result.runRecorded, true);
  assert.equal(db.automation_runs.length, 1);
  assert.equal(db.automation_runs[0].automation_id, automationId);
  assert.equal(db.automation_runs[0].zernio_workflow_id, "wf_tofu_1");
  assert.equal(db.automation_runs[0].zernio_execution_id, "ex_1");
  assert.equal(db.automation_runs[0].status, "completed");
  assert.equal(db.conversations[0].source_automation_id, automationId);

  const again = await applyZernioCrmEvent(client, OWNER, parsed.action);
  assert.equal(again.duplicate, true);
  assert.equal(db.automation_runs.length, 1);
});

test("un workflow que no es una pieza igual registra la corrida", async () => {
  const { client, db } = memoryAdmin();
  const parsed = parseZernioCrmBody(
    {
      id: "evt_loose",
      event: "workflow.run.started",
      timestamp: "2026-11-25T13:00:00.000Z",
      workflow: { id: "wf_mofu" },
      execution: { id: "ex_loose", status: "running" },
      contact: { id: "ct_9" },
    },
    "fallback",
  );
  const result = await applyZernioCrmEvent(client, OWNER, parsed.action);
  assert.equal(result.ok && result.runRecorded, true);
  assert.equal(db.automation_runs.length, 1);
  assert.equal(db.automation_runs[0].automation_id, null);
  assert.equal(db.automation_runs[0].zernio_workflow_id, "wf_mofu");
  assert.equal(db.automation_runs[0].status, "running");
});

test("Cal.com matchea por email, guarda utm y no duplica la reserva", async () => {
  const { client, db } = memoryAdmin({
    leads: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        owner_id: OWNER,
        name: "Otra",
        email: "sofia@estudio.dev",
        status: "CALIFICADO",
        dedupe_key: "slug:otra",
        created_at: "2026-10-01T00:00:00.000Z",
      },
    ],
  });
  const created = parseCalWebhook(fixture("cal-booking-created.json"), "fallback");
  assert.equal(created.kind, "booking");
  assert.equal(created.booking.handle, "estudio.demo");
  assert.equal(created.booking.utmSource, "instagram");
  const saved = await applyCalBooking(client, OWNER, created.booking);
  assert.equal(saved.ok && saved.createdLead, false);
  assert.equal(saved.leadId, "11111111-1111-4111-8111-111111111111");
  assert.equal(saved.status, "REUNION_AGENDADA");
  assert.equal(db.leads.length, 1);
  assert.equal(db.leads[0].status, "REUNION_AGENDADA");
  assert.equal(db.leads[0].intake.utm.source, "instagram");
  assert.equal(db.leads[0].intake.utm.campaign, "agenda");
  assert.equal(db.appointments.length, 1);
  assert.equal(db.appointments[0].external_uid, "book_100");
  assert.equal(db.appointments[0].utm_source, "instagram");
  assert.equal(db.appointments[0].utm_campaign, "agenda");
  assert.equal(db.appointments[0].status, "AGENDADA");
  assert.equal(db.appointments[0].meeting_url, "https://meet.example.com/sofia");

  const retry = await applyCalBooking(client, OWNER, created.booking);
  assert.equal(retry.duplicate, true);
  assert.equal(db.appointments.length, 1);
});

test("reprogramar actualiza el turno, cancelar lo marca y meeting ended cierra la reunión", async () => {
  const { client, db } = memoryAdmin();
  const created = parseCalWebhook(fixture("cal-booking-created.json"), "fallback");
  await applyCalBooking(client, OWNER, created.booking);
  const moved = parseCalWebhook(fixture("cal-booking-rescheduled.json"), "fallback");
  const rescheduled = await applyCalBooking(client, OWNER, moved.booking);
  assert.equal(rescheduled.ok && rescheduled.duplicate, false);
  assert.equal(db.appointments.length, 1);
  assert.equal(db.appointments[0].external_uid, "book_101");
  assert.equal(db.appointments[0].starts_at, "2026-11-27T13:00:00.000Z");
  assert.equal(db.appointments[0].status, "AGENDADA");

  const cancelled = parseCalWebhook(fixture("cal-booking-cancelled.json"), "fallback");
  const dropped = await applyCalBooking(client, OWNER, cancelled.booking);
  assert.equal(dropped.ok, true);
  assert.equal(db.appointments[0].status, "CANCELADA");
  assert.equal(db.leads[0].status, "REUNION_AGENDADA");

  const ended = parseCalWebhook(fixture("cal-meeting-ended.json"), "fallback");
  assert.equal(ended.booking.eventId, "MEETING_ENDED:ended_book_200");
  const done = await applyCalBooking(client, OWNER, ended.booking);
  assert.equal(done.ok && done.createdLead, true);
  assert.equal(done.status, "REUNION_REALIZADA");
  const lucia = db.leads.find((lead) => lead.email === "lucia@taller.com");
  assert.ok(lucia);
  assert.equal(lucia.status, "REUNION_REALIZADA");
  const turn = db.appointments.find((row) => row.external_uid === "book_200");
  assert.equal(turn.status, "REALIZADA");
  assert.equal(db.lead_lists.some((list) => list.name === "Cal.com"), true);
});

test("matchea por teléfono y por nombre, e ignora triggers que no usamos", async () => {
  const { client, db } = memoryAdmin({
    leads: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        owner_id: OWNER,
        name: "Taller Norte",
        phone: "+5491155556666",
        status: "CONTACTADO",
        dedupe_key: "phone:+5491155556666",
        created_at: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "55555555-5555-4555-8555-555555555555",
        owner_id: OWNER,
        name: "Ana Ruiz",
        status: "NUEVO",
        dedupe_key: "slug:ana",
        created_at: "2026-08-01T00:00:00.000Z",
      },
    ],
  });
  const byPhone = parseCalWebhook(
    {
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-25T10:00:00.000Z",
      payload: {
        uid: "book_phone",
        title: "Llamada",
        startTime: "2026-11-28T15:00:00.000Z",
        endTime: "2026-11-28T15:30:00.000Z",
        attendees: [{ name: "Taller", phoneNumber: "11 5555 6666" }],
      },
    },
    "fallback",
  );
  const phoneHit = await applyCalBooking(client, OWNER, byPhone.booking);
  assert.equal(phoneHit.leadId, "44444444-4444-4444-8444-444444444444");
  assert.equal(db.leads.find((lead) => lead.id === phoneHit.leadId).status, "REUNION_AGENDADA");

  const byName = parseCalWebhook(
    {
      triggerEvent: "BOOKING_CREATED",
      createdAt: "2026-11-25T11:00:00.000Z",
      payload: {
        uid: "book_name",
        title: "Llamada",
        startTime: "2026-11-29T15:00:00.000Z",
        endTime: "2026-11-29T15:30:00.000Z",
        attendees: [{ name: "ana ruiz" }],
      },
    },
    "fallback",
  );
  const nameHit = await applyCalBooking(client, OWNER, byName.booking);
  assert.equal(nameHit.leadId, "55555555-5555-4555-8555-555555555555");
  assert.equal(parseCalWebhook({ triggerEvent: "MEETING_STARTED", createdAt: "2026-11-25T00:00:00.000Z" }, "x").kind, "ignore");
  assert.equal(parseCalWebhook({ triggerEvent: "BOOKING_CREATED", payload: {} }, "x").kind, "invalid");
});

test("no_agenda cierra perdido y no pisa una reunión ya agendada", async () => {
  const { client, db } = memoryAdmin({
    leads: [
      {
        id: "66666666-6666-4666-8666-666666666666",
        owner_id: OWNER,
        name: "@estudio.demo",
        status: "INTERESADO",
        dedupe_key: "instagram:estudio.demo",
        instagram_url: "https://instagram.com/estudio.demo",
        intake: { zernio_contact_id: "ct_no", ig_username: "estudio.demo" },
        created_at: "2026-10-02T00:00:00.000Z",
      },
    ],
  });
  const rejected = parseZernioCrmBody(
    { id: "evt_no", event: "contact.tag_added", contact: { id: "ct_no", username: "estudio.demo" }, tag: "no_agenda" },
    "fallback",
  );
  const result = await applyZernioCrmEvent(client, OWNER, rejected.action);
  assert.equal(result.ok && result.status, "CERRADO_PERDIDO");
  assert.equal(db.leads[0].status, "CERRADO_PERDIDO");
  assert.ok(db.lead_activities.some((row) => row.content === "[zernio] no_agenda: rechazó agendar"));

  db.leads[0].status = "REUNION_AGENDADA";
  const late = parseZernioCrmBody(
    { id: "evt_no_tarde", event: "contact.tag_added", contact: { id: "ct_no", username: "estudio.demo" }, tag: "no_agenda" },
    "fallback",
  );
  const kept = await applyZernioCrmEvent(client, OWNER, late.action);
  assert.equal(kept.ok && kept.status, "REUNION_AGENDADA");
  assert.equal(db.leads[0].status, "REUNION_AGENDADA");
});
