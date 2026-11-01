import assert from "node:assert/strict";
import { test } from "node:test";

import { readDeclaredAgent, replyAgentsFromEnv } from "../lib/automation/agents.ts";
import { isSameMessage } from "../lib/automation/message-identity.ts";
import { contactBodySchema, planOutboundMessage } from "../lib/automation/outbound.ts";
import { manualReplyAnalysis, replyBodySchema } from "../lib/automation/reply.ts";
import { buildReconcile, parseReconcileDate } from "../lib/automation/reconcile.ts";

const PROSPECTING = ["ventas", "seguimiento", "julian", "email-outreach"];
const NOW = new Date("2026-10-28T15:00:00.000Z");

function plan(body, extra = {}) {
  const parsed = contactBodySchema.safeParse(body);
  assert.equal(parsed.success, true);
  if (!parsed.success) return null;
  return planOutboundMessage({
    body: parsed.data,
    agent: extra.agent ?? null,
    priorOutbound: extra.priorOutbound ?? 0,
    prospectingAgents: PROSPECTING,
    now: NOW,
  });
}

test("un contacto viejo sigue siendo apertura la primera vez y seguimiento después", () => {
  const first = plan({ content: "Hola, ¿cómo agendan?" });
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.plan.kind, "APERTURA");
  assert.equal(first.plan.part, 1);
  assert.equal(first.plan.analysis, null);
  assert.equal(first.plan.occurredAt, NOW.toISOString());

  const second = plan({ content: "Te escribo de nuevo." }, { priorOutbound: 1 });
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.plan.kind, "SEGUIMIENTO");
  assert.equal(second.plan.part, null);
});

test("el bloque opening sigue contando como apertura con ángulo, aunque ya haya salidas", () => {
  const result = plan(
    {
      content: "Vi sus reseñas.",
      opening: { angle: "REVIEWS", variant: 2, generated_content: "Vi sus reseñas." },
    },
    { priorOutbound: 4, agent: "julian" },
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.plan.kind, "APERTURA");
  assert.equal(result.plan.angle, "REVIEWS");
  assert.equal(result.plan.variant, 2);
  assert.equal(result.plan.generatedBy, "IA");
  assert.equal(result.plan.generatedContent, null);
});

test("una apertura de prospección sin tipo se rechaza; con tipo o ángulo, no", () => {
  const missing = plan({ content: "Hola", kind: "APERTURA" }, { agent: "julian", priorOutbound: 3 });
  assert.equal(missing.ok, false);
  const inferred = plan({ content: "Hola" }, { agent: "julian" });
  assert.equal(inferred.ok, false);

  const email = plan({ content: "Hola", kind: "APERTURA" }, { agent: "email-outreach" });
  assert.equal(email.ok, false);

  const typed = plan(
    { content: "Hola", kind: "APERTURA", type: "reseñas peluquería", variant: "v2 local" },
    { agent: "julian" },
  );
  assert.equal(typed.ok, true);
  if (!typed.ok) return;
  assert.equal(typed.plan.angle, null);
  assert.equal(typed.plan.variant, null);
  assert.deepEqual(typed.plan.analysis, {
    opening: { part: 1, type: "reseñas peluquería", variant: "v2 local" },
  });

  const known = plan({ content: "Hola", kind: "APERTURA", type: "Reputación y reseñas", variant: 2 }, { agent: "seguimiento" });
  assert.equal(known.ok, true);
  if (!known.ok) return;
  assert.equal(known.plan.angle, "REVIEWS");
  assert.equal(known.plan.variant, 2);

  const anonymous = plan({ content: "Hola", kind: "APERTURA" });
  assert.equal(anonymous.ok, true);
});

test("la parte 2 no es seguimiento y no guarda ángulo", () => {
  const byKind = plan(
    { content: "¿Suelen responderles tarde?", kind: "APERTURA_M2", type: "REVIEWS", occurred_at: "2026-10-28T11:05:00-03:00" },
    { agent: "julian", priorOutbound: 1 },
  );
  assert.equal(byKind.ok, true);
  if (!byKind.ok) return;
  assert.equal(byKind.plan.kind, "APERTURA");
  assert.equal(byKind.plan.part, 2);
  assert.equal(byKind.plan.angle, null);
  assert.equal(byKind.plan.occurredAt, "2026-10-28T14:05:00.000Z");

  const byPart = plan({ content: "Segundo texto", part: "2", type: "turnos" }, { agent: "email-outreach" });
  assert.equal(byPart.ok, true);
  if (!byPart.ok) return;
  assert.equal(byPart.plan.part, 2);

  assert.equal(plan({ content: "Hola", kind: "SEGUIMIENTO", part: 1 }).ok, false);
  assert.equal(plan({ content: "Hola", kind: "APERTURA", part: 2 }, { agent: "ventas" }).ok, false);
  assert.equal(
    plan({ content: "dentro de una hora", occurred_at: "2026-10-28T18:00:00.000Z" }, { agent: null }).ok,
    false,
  );
});

test("el agente del contacto es opcional y tiene que coincidir", () => {
  assert.deepEqual(readDeclaredAgent({}), { ok: true, agent: null });
  assert.deepEqual(readDeclaredAgent({ headerAgent: "Julian" }), { ok: true, agent: "julian" });
  const mismatch = readDeclaredAgent({ bodyAgent: "julian", headerAgent: "seguimiento" });
  assert.equal(mismatch.ok, false);
  const bad = readDeclaredAgent({ bodyAgent: "no es un id" });
  assert.equal(bad.ok, false);
});

test("responden seguimiento, julian y email-outreach, y el env reemplaza la lista", () => {
  const agents = replyAgentsFromEnv({});
  assert.equal(agents.includes("seguimiento"), true);
  assert.equal(agents.includes("julian"), true);
  assert.equal(agents.includes("email-outreach"), true);
  assert.equal(agents.includes("ventas"), true);
  assert.deepEqual(replyAgentsFromEnv({ AUTOMATION_REPLY_AGENTS: "email-outreach" }), ["email-outreach"]);
});

test("la respuesta manual arma el análisis que lee el panel", () => {
  const parsed = replyBodySchema.safeParse({
    content: "  Sí, me interesa verlo  ",
    occurred_at: "2026-10-28T14:30:00-03:00",
    response_type: "HUMANA",
    interest_level: 8,
    wants_meeting: true,
  });
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.channel, "WHATSAPP");
  assert.equal(parsed.data.content, "Sí, me interesa verlo");

  const analysis = manualReplyAnalysis({
    agent: "seguimiento",
    responseType: "HUMANA",
    interestLevel: 8,
    wantsMeeting: true,
    disqualify: false,
  });
  assert.equal(analysis.analysis.response_type, "HUMANA");
  assert.equal(analysis.analysis.interest_level, 8);
  assert.equal(analysis.analysis.wants_meeting, true);

  assert.equal(replyBodySchema.safeParse({ content: "hola", interest_level: 11 }).success, false);
  assert.equal(replyBodySchema.safeParse({ content: "hola", response_type: "DUDOSA" }).success, false);
  assert.equal(replyBodySchema.safeParse({ content: "hola" }).success, true);
});

test("el mismo texto y la misma hora son el mismo mensaje", () => {
  const incoming = { content: "Sí, dale", channel: "WHATSAPP", occurredAt: "2026-10-28T14:30:00.000Z" };
  assert.equal(
    isSameMessage({ content: "  Sí,   dale ", channel: "WHATSAPP", occurredAt: "2026-10-28T14:31:00.000Z" }, incoming),
    true,
  );
  assert.equal(
    isSameMessage({ content: "Sí, dale", channel: "WHATSAPP", occurredAt: "2026-10-28T14:40:00.000Z" }, incoming),
    false,
  );
  assert.equal(
    isSameMessage({ content: "Sí, dale", channel: "EMAIL", occurredAt: "2026-10-28T14:30:00.000Z" }, incoming),
    false,
  );
});

test("reconcile arma el día de Argentina y separa la parte 2", () => {
  assert.equal(parseReconcileDate("2026-10-28"), "2026-10-28");
  assert.equal(parseReconcileDate("2026-02-31"), null);
  assert.equal(parseReconcileDate(null), null);

  const day = buildReconcile(
    "2026-10-28",
    [{ id: "lead-1", name: "Ana", phone: "+54911", status: "RESPONDIO" }],
    [
      {
        id: "m1",
        leadId: "lead-1",
        sender: "VENDEDOR",
        channel: "WHATSAPP",
        kind: "APERTURA",
        content: "Hola",
        analysis: { opening: { part: 1, type: "reseñas", variant: "2" } },
        confirmed: true,
        occurredAt: "2026-10-28T14:00:00.000Z",
      },
      {
        id: "m2",
        leadId: "lead-1",
        sender: "VENDEDOR",
        channel: "WHATSAPP",
        kind: "APERTURA",
        content: "¿Cómo responden hoy?",
        analysis: { opening: { part: 2, type: "reseñas", variant: "2" } },
        confirmed: true,
        occurredAt: "2026-10-28T14:01:00.000Z",
      },
      {
        id: "draft",
        leadId: "lead-1",
        sender: "VENDEDOR",
        channel: "WHATSAPP",
        kind: "SEGUIMIENTO",
        content: "borrador",
        analysis: null,
        confirmed: false,
        occurredAt: "2026-10-28T14:02:00.000Z",
      },
      {
        id: "in1",
        leadId: "lead-1",
        sender: "LEAD",
        channel: "WHATSAPP",
        kind: null,
        content: "Me interesa",
        analysis: { analysis: { response_type: "HUMANA", interest_level: 8 } },
        confirmed: false,
        occurredAt: "2026-10-28T16:00:00.000Z",
      },
    ],
  );

  assert.equal(day.timezone, "America/Argentina/Buenos_Aires");
  assert.equal(day.from, "2026-10-28T03:00:00.000Z");
  assert.equal(day.to, "2026-10-29T03:00:00.000Z");
  assert.equal(day.totals.outgoing, 2);
  assert.equal(day.totals.incoming, 1);
  assert.equal(day.leads[0].outgoing[1].kind, "APERTURA_M2");
  assert.equal(day.leads[0].outgoing[0].type, "reseñas");
  assert.equal(day.leads[0].incoming[0].responseType, "HUMANA");
  assert.equal(day.leads[0].incoming[0].interestLevel, 8);
});
