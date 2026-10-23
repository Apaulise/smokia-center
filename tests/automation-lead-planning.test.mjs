import assert from "node:assert/strict";
import { test } from "node:test";

import { leadPlanningBodySchema, toLeadPlanningPatch } from "../lib/automation/lead-planning.ts";
import { leadPlanningColumns } from "../lib/leads/planning.ts";

function parse(body) {
  const parsed = leadPlanningBodySchema.safeParse(body);
  if (!parsed.success) assert.fail(JSON.stringify(parsed.error.issues));
  return toLeadPlanningPatch(parsed.data);
}

test("acepta notes, next_action_at, o los dos, y deja borrar con null", () => {
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
});

test("rechaza un body vacío, una fecha sin zona y cualquier otro campo (incluido status)", () => {
  assert.equal(leadPlanningBodySchema.safeParse({}).success, false);
  assert.equal(leadPlanningBodySchema.safeParse(null).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ next_action_at: "2026-10-30T15:00:00" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ next_action_at: "2026-10-30" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "x".repeat(4001) }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ notes: "hola", status: "CONTACTADO" }).success, false);
  assert.equal(leadPlanningBodySchema.safeParse({ nextActionAt: "2026-10-30T18:00:00Z" }).success, false);
});

test("el update sólo escribe notes y next_action_at, y omite lo que no vino", () => {
  assert.equal(leadPlanningColumns({}), null);
  assert.deepEqual(leadPlanningColumns({ notes: "hola" }), { notes: "hola" });
  assert.deepEqual(leadPlanningColumns({ notes: null }), { notes: null });
  assert.deepEqual(leadPlanningColumns({ nextActionAt: null }), { next_action_at: null });
  assert.deepEqual(leadPlanningColumns({ nextActionAt: "" }), { next_action_at: null });
  assert.deepEqual(leadPlanningColumns({ nextActionAt: "2026-10-30T15:00:00-03:00" }), {
    next_action_at: "2026-10-30T18:00:00.000Z",
  });
  const both = leadPlanningColumns({ notes: "hola", nextActionAt: "2026-10-30T18:00:00Z" });
  assert.deepEqual(Object.keys(both).sort(), ["next_action_at", "notes"]);
  assert.equal("status" in both, false);
  assert.equal("last_contacted_at" in both, false);
});
