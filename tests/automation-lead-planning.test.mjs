import assert from "node:assert/strict";
import { test } from "node:test";

import { decideWriteAgent, writeAgentsFromEnv } from "../lib/automation/agents.ts";
import {
  CORRECTION_ACTIVITY_TYPE,
  leadPlanningBodySchema,
  planLeadCorrection,
  toLeadCorrectionInput,
} from "../lib/automation/lead-planning.ts";

function parse(body) {
  const parsed = leadPlanningBodySchema.safeParse(body);
  if (!parsed.success) assert.fail(JSON.stringify(parsed.error.issues));
  return toLeadCorrectionInput(parsed.data);
}

function snapshot(overrides = {}) {
  return {
    phone: null,
    notes: null,
    nextActionAt: null,
    dedupeKey: "slug:acme-rosario",
    name: "Acme",
    website: null,
    city: "Rosario",
    sourceUrl: null,
    ...overrides,
  };
}

test("acepta notes, next_action_at, phone, o una mezcla, y deja borrar con null", () => {
  assert.deepEqual(parse({ notes: "  Retomar el jueves  " }), { notes: "Retomar el jueves" });
  assert.deepEqual(parse({ next_action_at: "2026-10-30T15:00:00-03:00" }), {
    nextActionAt: "2026-10-30T15:00:00-03:00",
  });
  assert.deepEqual(parse({ next_action_at: "2026-10-30T18:00:00Z" }), {
    nextActionAt: "2026-10-30T18:00:00Z",
  });
  assert.deepEqual(
    parse({ notes: "Preguntar por el turno", next_action_at: "2026-10-30T15:00:00.000-03:00" }),
    { notes: "Preguntar por el turno", nextActionAt: "2026-10-30T15:00:00.000-03:00" },
  );
  assert.deepEqual(parse({ notes: null, next_action_at: null }), { notes: null, nextActionAt: null });
  assert.deepEqual(parse({ notes: "   " }), { notes: null });
  assert.deepEqual(parse({ phone: "+54 9 11 5555-6666", agent: "Ventas" }), { phone: "+54 9 11 5555-6666" });
  assert.deepEqual(parse({ phone: null }), { phone: null });
  assert.deepEqual(parse({ phone: "   " }), { phone: null });
});

test("rechaza un body vacío, una fecha sin zona, un teléfono inútil y cualquier otro campo", () => {
  assert.equal(leadPlanningBodySchema.safeParse({}).success, false);
  assert.equal(leadPlanningBodySchema.safeParse(null).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ agent: "ventas" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ next_action_at: "2026-10-30T15:00:00" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ next_action_at: "2026-10-30" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "x".repeat(4001) }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "hola", status: "CONTACTADO" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "hola", email: "hola@acme.com" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ email: "hola@acme.com" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ nextActionAt: "2026-10-30T18:00:00Z" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ phone: "123" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ phone: "abc", agent: "ventas" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "hola", agent: "no es un id" }).success, false);
  const withAgent = leadPlanningBodySchema.safeParse({ notes: "hola", agent: "Ventas" });
  assert.equal(withAgent.success, true);
  if (withAgent.success) assert.equal(withAgent.data.agent, "ventas");
});

test("por defecto escriben ventas y seguimiento; el env reemplaza la lista", () => {
  assert.deepEqual(writeAgentsFromEnv({}), ["ventas", "seguimiento"]);
  assert.deepEqual(writeAgentsFromEnv({ AUTOMATION_WRITE_AGENTS: "   " }), ["ventas", "seguimiento"]);
  assert.deepEqual(writeAgentsFromEnv({ AUTOMATION_WRITE_AGENTS: " Ventas, Auditor " }), ["ventas", "auditor"]);

  assert.deepEqual(
    decideWriteAgent({ bodyAgent: "Ventas", allowed: ["ventas", "seguimiento"] }),
    { ok: true, agent: "ventas" },
  );
  assert.deepEqual(
    decideWriteAgent({ headerAgent: "SEGUIMIENTO", allowed: ["ventas", "seguimiento"] }),
    { ok: true, agent: "seguimiento" },
  );
  assert.deepEqual(
    decideWriteAgent({ bodyAgent: "ventas", headerAgent: "Ventas", allowed: ["ventas"] }),
    { ok: true, agent: "ventas" },
  );

  const missing = decideWriteAgent({ allowed: ["ventas", "seguimiento"] });
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.status, 400);

  const mismatch = decideWriteAgent({
    bodyAgent: "ventas",
    headerAgent: "seguimiento",
    allowed: ["ventas", "seguimiento"],
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) assert.equal(mismatch.status, 400);

  const denied = decideWriteAgent({ bodyAgent: "auditor", allowed: ["ventas", "seguimiento"] });
  assert.equal(denied.ok, false);
  if (!denied.ok) assert.equal(denied.status, 403);

  const weird = decideWriteAgent({ headerAgent: "con espacios", allowed: ["con espacios"] });
  assert.equal(weird.ok, false);
  if (!weird.ok) assert.equal(weird.status, 400);
});

test("normaliza el teléfono argentino, rearma el dedupe y no toca estado ni último contacto", () => {
  assert.equal(CORRECTION_ACTIVITY_TYPE, "NOTA");

  const loaded = planLeadCorrection(snapshot(), { phone: "+54 9 11 5555-6666" }, "ventas");
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.plan.columns.phone, "+5491155556666");
  assert.equal(loaded.plan.columns.dedupe_key, "phone:+5491155556666");
  assert.equal(loaded.plan.nextDedupeKey, "phone:+5491155556666");
  assert.equal(loaded.plan.activity, "[ventas] Teléfono cargado: +5491155556666.");
  assert.equal("status" in loaded.plan.columns, false);
  assert.equal("last_contacted_at" in loaded.plan.columns, false);

  const same = planLeadCorrection(
    snapshot({ phone: "+5491155556666", dedupeKey: "phone:+5491155556666" }),
    { phone: "5491155556666" },
    "seguimiento",
  );
  assert.equal(same.ok, true);
  if (!same.ok) return;
  assert.equal(same.plan.columns, null);
  assert.equal(same.plan.activity, null);
  assert.equal(same.plan.nextDedupeKey, null);

  const cleared = planLeadCorrection(
    snapshot({
      phone: "+5491155556666",
      dedupeKey: "phone:+5491155556666",
      website: "https://www.acme.com.ar/inicio",
    }),
    { phone: null },
    "seguimiento",
  );
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.equal(cleared.plan.columns.phone, null);
  assert.equal(cleared.plan.columns.dedupe_key, "domain:acme.com.ar");
  assert.match(cleared.plan.activity, /^\[seguimiento\] Teléfono borrado/);

  const invalid = planLeadCorrection(snapshot(), { phone: "123" }, "ventas");
  assert.equal(invalid.ok, false);
});

test("la nota y la próxima acción sólo se anotan cuando cambian, y la misma fecha en otra zona no se reescribe", () => {
  const noted = planLeadCorrection(snapshot(), { notes: "Pide factura A" }, "ventas");
  assert.equal(noted.ok, true);
  if (!noted.ok) return;
  assert.deepEqual(noted.plan.columns, { notes: "Pide factura A" });
  assert.equal(noted.plan.activity, "[ventas] Pide factura A");

  const repeat = planLeadCorrection(snapshot({ notes: "Pide factura A" }), { notes: "Pide factura A" }, "ventas");
  assert.equal(repeat.ok, true);
  if (!repeat.ok) return;
  assert.equal(repeat.plan.columns, null);
  assert.equal(repeat.plan.activity, null);

  const cleared = planLeadCorrection(snapshot({ notes: "vieja" }), { notes: null }, "ventas");
  assert.equal(cleared.ok, true);
  if (!cleared.ok) return;
  assert.deepEqual(cleared.plan.columns, { notes: null });
  assert.equal(cleared.plan.activity, "[ventas] Nota borrada.");

  const scheduled = planLeadCorrection(snapshot(), { nextActionAt: "2026-10-30T15:00:00-03:00" }, "seguimiento");
  assert.equal(scheduled.ok, true);
  if (!scheduled.ok) return;
  assert.deepEqual(scheduled.plan.columns, { next_action_at: "2026-10-30T18:00:00.000Z" });
  assert.equal(scheduled.plan.activity, "[seguimiento] Próxima acción: 2026-10-30T15:00:00-03:00.");

  const sameInstant = planLeadCorrection(
    snapshot({ nextActionAt: "2026-10-30T18:00:00.000Z" }),
    { nextActionAt: "2026-10-30T15:00:00-03:00" },
    "ventas",
  );
  assert.equal(sameInstant.ok, true);
  if (!sameInstant.ok) return;
  assert.equal(sameInstant.plan.columns, null);
  assert.equal(sameInstant.plan.activity, null);

  const unset = planLeadCorrection(
    snapshot({ nextActionAt: "2026-10-30T18:00:00.000Z" }),
    { nextActionAt: null },
    "ventas",
  );
  assert.equal(unset.ok, true);
  if (!unset.ok) return;
  assert.deepEqual(unset.plan.columns, { next_action_at: null });
  assert.equal(unset.plan.activity, "[ventas] Próxima acción borrada.");
});

test("un PATCH con teléfono, nota y fecha deja una sola nota de historial y no un contacto", () => {
  const planned = planLeadCorrection(
    snapshot({ phone: "+541100000000", dedupeKey: "phone:+541100000000" }),
    {
      phone: "+54 9 11 5555-6666",
      notes: "Número real de WhatsApp",
      nextActionAt: "2026-10-30T15:00:00-03:00",
    },
    "seguimiento",
  );
  assert.equal(planned.ok, true);
  if (!planned.ok) return;
  assert.equal(
    planned.plan.activity,
    [
      "[seguimiento] Teléfono corregido: +5491155556666 (antes +541100000000).",
      "Próxima acción: 2026-10-30T15:00:00-03:00.",
      "Número real de WhatsApp",
    ].join("\n"),
  );
  assert.deepEqual(Object.keys(planned.plan.columns).sort(), ["dedupe_key", "next_action_at", "notes", "phone"]);
  assert.equal(planned.plan.columns.next_action_at, "2026-10-30T18:00:00.000Z");
  assert.equal("status" in planned.plan.columns, false);
  assert.equal("last_contacted_at" in planned.plan.columns, false);
});
