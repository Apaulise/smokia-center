import assert from "node:assert/strict";
import test from "node:test";
import * as model from "../lib/crm/model.ts";
const { argentinaDay, crmDashboardSummary, taskGroup } = model;
import { readCrmPages } from "../lib/crm/db.ts";

test("el día de Buenos Aires cambia a las 03:00 UTC", () => {
  assert.equal(argentinaDay(new Date("2026-11-21T02:59:59Z")), "2026-11-20");
  assert.equal(argentinaDay(new Date("2026-11-21T03:00:00Z")), "2026-11-21");
});

test("el resumen cuenta sólo tareas pendientes y cada cliente una vez", () => {
  const today = "2026-11-21";
  const task = (client_id, due_date, assigneeIds = ["yo", "socio"], completed_at = null) => ({
    client_id, due_date, assigneeIds, completed_at,
  });
  const clients = [{ status: "active" }, { status: "paused" }, { status: "active" }];
  const tasks = [
    task("primero", today),
    task("primero", "2026-11-20"),
    task("segundo", today, ["socio"]),
    task("tercero", today, ["yo"], "2026-11-21T12:00:00Z"),
    task("tercero", "2026-11-22"),
    task("tercero", null),
  ];
  assert.deepEqual(crmDashboardSummary(clients, tasks, "yo", today), {
    tasksToday: 1, overdue: 1, clientsDue: 2, active: 2,
  });
  assert.deepEqual(crmDashboardSummary(clients, tasks.slice(3), "yo", today), {
    tasksToday: 0, overdue: 0, clientsDue: 0, active: 2,
  });
});

test("el filtro por responsable incluye tareas compartidas y distingue las sin asignar", () => {
  assert.equal(model.matchesAssignee(["yo", "socio"], "socio"), true);
  assert.equal(model.matchesAssignee(["yo", "socio"], "tercero"), false);
  assert.equal(model.matchesAssignee(["yo", "socio"], "sin-responsable"), false);
  assert.equal(model.matchesAssignee([], "sin-responsable"), true);
  assert.equal(model.matchesAssignee([], ""), true);
});

test("el cliente conserva su responsable original y agrega responsables únicos", () => {
  assert.deepEqual(model.clientAssigneeIds("yo", [{ user_id: "socio" }, { user_id: "yo" }]), ["yo", "socio"]);
  assert.deepEqual(model.clientAssigneeIds(null, [{ user_id: "socio" }]), ["socio"]);
  assert.deepEqual(model.clientAssigneeIds(null, []), []);
  for (const status of ["renewal", "completed", "archived"]) {
    assert.ok(model.clientStatuses.includes(status));
    assert.ok(model.clientStatusLabels[status]);
  }
});

test("las lecturas recuperan más de 1000 filas y propagan errores sin datos parciales", async () => {
  const rows = Array.from({ length: 1001 }, (_, index) => index);
  const read = (from, to) => Promise.resolve({ data: rows.slice(from, to + 1), error: null });
  assert.deepEqual(await readCrmPages(read), { data: rows, error: null });
  const missing = { code: "PGRST205" };
  assert.deepEqual(await readCrmPages((from, to) => from === 0 ? read(from, to) : Promise.resolve({ data: null, error: missing })), {
    data: [], error: missing,
  });
});

test("clasifica pendientes y conserva el vencimiento al reabrir", () => {
  const today = "2026-11-21";
  const item = (due_date, completed_at = null) => ({ due_date, completed_at });
  assert.equal(taskGroup(item(null), today), "undated");
  assert.equal(taskGroup(item("2026-11-20"), today), "overdue");
  assert.equal(taskGroup(item("2026-11-21"), today), "today");
  assert.equal(taskGroup(item("2026-11-22"), today), "upcoming");
  assert.equal(taskGroup(item("2026-11-20", "2026-11-21T14:00:00Z"), today), "done");
  assert.equal(taskGroup(item("2026-11-20"), today), "overdue");
});
