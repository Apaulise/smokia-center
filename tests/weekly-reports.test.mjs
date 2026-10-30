import assert from "node:assert/strict";
import { test } from "node:test";

import { startOfWeekIso } from "../lib/leads/calendar.ts";
import { canPublishWeekly } from "../lib/weekly/access.ts";
import { computeBrand, computeFollowUps, computeProspecting, isPositiveReply, replyClass } from "../lib/weekly/compute.ts";
import { mergeReport } from "../lib/weekly/merge.ts";
import { parseChanges } from "../lib/weekly/parse.ts";
import { presentWeekly } from "../lib/weekly/present.ts";
import { camelizeWeekly, weeklyPublishPayload } from "../lib/weekly/schema.ts";
import { isPublishableWeek, parseWeekStart, weekWindow } from "../lib/weekly/weeks.ts";
import { weeklyArea } from "../lib/weekly/areas.ts";

const WEEK = "2026-10-26";
const PREV = "2026-10-19";
const NOW = new Date("2026-10-30T15:00:00.000Z");

function message(partial) {
  return {
    leadId: "lead-1",
    sender: "VENDEDOR",
    channel: "WHATSAPP",
    kind: "APERTURA",
    angle: "REVIEWS",
    variant: 1,
    analysis: null,
    confirmed: true,
    occurredAt: "2026-10-26T15:00:00.000Z",
    ...partial,
  };
}

function human(interest, extra = {}) {
  return { analysis: { response_type: "HUMANA", interest_level: interest, wants_meeting: false, disqualify: false, ...extra } };
}

test("la semana es el lunes de Argentina y no un día cualquiera", () => {
  assert.equal(parseWeekStart("2026-10-26"), WEEK);
  assert.equal(parseWeekStart("2026-10-28"), null);
  assert.equal(parseWeekStart("2026-W44"), WEEK);
  assert.equal(parseWeekStart("2026-W54"), null);
  assert.equal(startOfWeekIso("2026-10-30"), WEEK);
  assert.equal(isPublishableWeek("2026-11-02", NOW), false);
  assert.equal(isPublishableWeek(WEEK, NOW), true);

  const window = weekWindow(WEEK);
  assert.equal(window.days.length, 7);
  assert.ok(Date.parse("2026-10-26T03:00:00.000Z") >= window.startMs);
  assert.ok(Date.parse("2026-10-26T02:59:00.000Z") < window.startMs);
  assert.ok(Date.parse("2026-11-02T02:59:00.000Z") < window.endMs);
  assert.ok(Date.parse("2026-11-02T03:00:00.000Z") >= window.endMs);
});

test("una respuesta sin análisis no cuenta como real ni como positiva", () => {
  assert.equal(replyClass(null), "unknown");
  assert.equal(replyClass(human(4)), "real");
  assert.equal(replyClass({ analysis: { response_type: "AUTORESPUESTA" } }), "auto");
  assert.equal(isPositiveReply(human(6)), false);
  assert.equal(isPositiveReply(human(7)), true);
  assert.equal(isPositiveReply(human(2, { wants_meeting: true })), true);
  assert.equal(isPositiveReply(human(9, { disqualify: true })), false);
  assert.equal(isPositiveReply(null), false);
});

test("prospección: tasas, muestra y lo que no se puede atribuir", () => {
  const messages = [
    message({ occurredAt: "2026-10-26T02:00:00.000Z" }),
    message({ leadId: "a", occurredAt: "2026-10-26T15:00:00.000Z", angle: "REVIEWS", variant: 2 }),
    message({ leadId: "b", occurredAt: "2026-10-27T15:00:00.000Z", angle: "REVIEWS", variant: 2 }),
    message({
      leadId: "a",
      sender: "LEAD",
      kind: null,
      angle: null,
      variant: null,
      occurredAt: "2026-10-26T18:00:00.000Z",
      analysis: human(8),
    }),
    message({
      leadId: "c",
      sender: "LEAD",
      kind: null,
      angle: null,
      variant: null,
      occurredAt: "2026-10-27T18:00:00.000Z",
      analysis: { analysis: { response_type: "AUTORESPUESTA" } },
    }),
    message({
      leadId: "b",
      sender: "LEAD",
      kind: null,
      angle: null,
      variant: null,
      occurredAt: "2026-10-27T16:00:00.000Z",
      analysis: null,
    }),
    message({ leadId: "d", sender: "VENDEDOR", kind: "SEGUIMIENTO", angle: null, variant: null, occurredAt: "2026-10-28T15:00:00.000Z" }),
  ];

  const week = computeProspecting(messages, WEEK, "WHATSAPP");
  assert.equal(week.totals.sent, 2);
  assert.equal(week.totals.realReplies, 1);
  assert.equal(week.totals.autoReplies, 1);
  assert.equal(week.totals.unclassifiedReplies, 1);
  assert.equal(week.totals.positive, 1);
  assert.equal(week.unattributedReplies, 1);
  assert.equal(week.byType.length, 1);
  assert.equal(week.byType[0].sent, 2);
  assert.equal(week.byType[0].realReplies, 1);
  assert.equal(week.byType[0].variantLabel, "Variante 2");
  assert.equal(week.daily.find((day) => day.day === "2026-10-26").sent, 1);
  assert.equal(week.daily.find((day) => day.day === "2026-10-25"), undefined);
});

test("seguimiento: el paso cuenta los anteriores y la respuesta no salta al próximo", () => {
  const followUps = [
    { id: "old", leadId: "a", channel: "WHATSAPP", occurredAt: "2026-10-10T15:00:00.000Z" },
    { id: "this", leadId: "a", channel: "WHATSAPP", occurredAt: "2026-10-27T15:00:00.000Z" },
    { id: "next", leadId: "a", channel: "WHATSAPP", occurredAt: "2026-10-28T15:00:00.000Z" },
  ];
  const replies = [
    message({
      leadId: "a",
      sender: "LEAD",
      kind: null,
      angle: null,
      variant: null,
      occurredAt: "2026-10-27T18:00:00.000Z",
      analysis: human(8),
    }),
    message({
      leadId: "a",
      sender: "LEAD",
      kind: null,
      angle: null,
      variant: null,
      occurredAt: "2026-10-28T18:00:00.000Z",
      analysis: human(9),
    }),
  ];
  const activities = [{ leadId: "a", occurredAt: "2026-10-27T20:00:00.000Z", toStatus: "REUNION_AGENDADA" }];

  const week = computeFollowUps({ followUps, replies, activities, appointments: [], weekStart: WEEK });
  assert.equal(week.totals.sent, 2);
  assert.equal(week.totals.realReplies, 2);
  assert.equal(week.booked, 1);
  assert.equal(week.byType.find((row) => row.typeLabel === "2.º seguimiento").realReplies, 1);
  assert.equal(week.byType.find((row) => row.typeLabel === "3.º o más").realReplies, 1);
  assert.equal(week.medianDaysToReply, 0.1);
});

test("marca: sin snapshot no hay cero, y el parcial avisa la cobertura", () => {
  const week = computeBrand({
    weekStart: WEEK,
    posts: [
      { id: "p1", kind: "REEL", publishedAt: "2026-10-27T15:00:00.000Z" },
      { id: "p2", kind: "REEL", publishedAt: "2026-10-28T15:00:00.000Z" },
    ],
    accountMetrics: [
      { capturedOn: "2026-10-27", followersCount: 100, newFollowers: 2, reach: 40, totalInteractions: 5 },
      { capturedOn: "2026-10-28", followersCount: null, newFollowers: null, reach: null, totalInteractions: null },
    ],
    postMetrics: [{ postId: "p1", capturedOn: "2026-10-28", reach: 10, likes: 3, comments: 1, saved: 0, views: 20 }],
  });
  assert.equal(week.published, 2);
  assert.equal(week.followers, 100);
  assert.equal(week.reach, 40);
  assert.equal(week.byKind[0].reach, 10);
  assert.equal(week.byKind[0].measured, 1);
  assert.equal(week.dailyReach.find((day) => day.day === "2026-10-26").reach, null);
  assert.equal(week.dailyPublished.find((day) => day.day === "2026-10-27").sent, 1);

  const empty = computeBrand({ weekStart: WEEK, posts: [], accountMetrics: [], postMetrics: [] });
  assert.equal(empty.followers, null);
  assert.equal(empty.reach, null);
  assert.equal(empty.published, 0);
});

test("publicar de nuevo no pisa una decisión ni borra un cambio ya medido", () => {
  const existing = {
    conclusions: "Antes.",
    conclusionStatus: "medido",
    conclusionResult: "Subió la tasa.",
    metrics: [],
    messageStats: [],
    series: [],
    changes: [
      { key: "reviews-v2", title: "Viejo", detail: "", status: "en_prueba", result: "Va bien." },
      { key: "otro", title: "Quedó", detail: "", status: "descartado", result: null },
      { key: "pendiente", title: "Sale", detail: "", status: "pendiente", result: "nota" },
    ],
  };
  const merged = mergeReport(existing, {
    conclusions: "Ahora.",
    metrics: [],
    messageStats: [],
    series: [],
    changes: [{ key: "reviews-v2", title: "Nuevo título", detail: "Detalle" }],
  });
  assert.equal(merged.next.conclusions, "Ahora.");
  assert.equal(merged.next.conclusionStatus, "medido");
  assert.equal(merged.next.conclusionResult, "Subió la tasa.");
  assert.equal(merged.next.changes.find((change) => change.key === "reviews-v2").status, "en_prueba");
  assert.equal(merged.next.changes.find((change) => change.key === "reviews-v2").title, "Nuevo título");
  assert.equal(merged.next.changes.find((change) => change.key === "reviews-v2").result, "Va bien.");
  assert.equal(merged.next.changes.some((change) => change.key === "otro"), true);
  assert.equal(merged.next.changes.some((change) => change.key === "pendiente"), false);
  assert.equal(merged.preservedDecisions, 3);
});

test("el payload acepta snake_case y rechaza una semana que no es lunes", () => {
  const ok = weeklyPublishPayload.safeParse(
    camelizeWeekly({
      agent: "mr-pou",
      area: "whatsapp",
      week: "2026-W44",
      conclusions: "Mejor la variante 2.",
      message_stats: [{ type: "REVIEWS", variant: 2, sent: 4, real_replies: 1 }],
      changes: [{ key: "reviews-v2", title: "Dejar la variante 2" }],
    }),
  );
  assert.equal(ok.success, true);
  if (ok.success) {
    assert.equal(ok.data.weekStart, WEEK);
    assert.equal(ok.data.messageStats[0].realReplies, 1);
    assert.equal(ok.data.messageStats[0].variant, "2");
  }

  const bad = weeklyPublishPayload.safeParse({ area: "whatsapp", week: "2026-10-27", conclusions: "Hola" });
  assert.equal(bad.success, false);

  const future = weeklyPublishPayload.safeParse({ area: "x_threads", week: "2026-11-02", conclusions: "Hola" });
  assert.equal(future.success, false);
});

test("mr-pou publica cualquier área; julian sólo las aperturas", () => {
  const admin = { AUTOMATION_ADMIN_AGENTS: "mr-pou" };
  assert.equal(canPublishWeekly("mr-pou", "x_threads", admin), true);
  assert.equal(canPublishWeekly("julian", "whatsapp", {}), true);
  assert.equal(canPublishWeekly("julian", "seguimientos", {}), false);
  assert.equal(canPublishWeekly("julian", "instagram", {}), false);
  assert.equal(canPublishWeekly("seguimiento", "seguimientos", {}), true);
  assert.equal(canPublishWeekly("contenido", "instagram", { AUTOMATION_WEEKLY_AGENTS: "contenido" }), true);
  assert.equal(canPublishWeekly("ventas", "youtube", {}), false);
});

test("la pantalla no muestra un cero cuando el dato no existe", () => {
  const emptyProspecting = computeProspecting([], WEEK, "WHATSAPP");
  const previous = computeProspecting([], PREV, "WHATSAPP");
  const page = presentWeekly({
    area: weeklyArea("whatsapp"),
    weekStart: WEEK,
    weeks: [WEEK],
    schemaReady: true,
    reportError: null,
    crmError: null,
    truncated: false,
    brandConnected: null,
    prospecting: { current: emptyProspecting, previous },
    followups: null,
    brand: null,
    report: null,
    previousMetrics: [],
  });
  const rateKpi = page.kpis.find((kpi) => kpi.key === "rate");
  assert.equal(rateKpi.display, "—");
  assert.equal(rateKpi.delta, "sin enviados");
  assert.equal(page.kpis.find((kpi) => kpi.key === "sent").display, "0");
  assert.equal(page.table, null);

  const threads = presentWeekly({
    area: weeklyArea("x_threads"),
    weekStart: WEEK,
    weeks: [WEEK],
    schemaReady: true,
    reportError: null,
    crmError: null,
    truncated: false,
    brandConnected: null,
    prospecting: null,
    followups: null,
    brand: null,
    report: null,
    previousMetrics: [],
  });
  assert.equal(threads.empty, true);
  assert.equal(threads.kpis.length, 0);

  const reported = presentWeekly({
    area: weeklyArea("x_threads"),
    weekStart: WEEK,
    weeks: [WEEK],
    schemaReady: true,
    reportError: null,
    crmError: null,
    truncated: false,
    brandConnected: null,
    prospecting: null,
    followups: null,
    brand: null,
    previousMetrics: [],
    report: {
      id: "r1",
      area: "x_threads",
      weekStart: WEEK,
      conclusions: "Poca respuesta.",
      conclusionStatus: "pendiente",
      conclusionResult: null,
      metrics: [{ key: "enviados", label: "Enviados", value: 12, unit: "count", note: "contados a mano" }],
      messageStats: [{ type: "hilo", variant: null, sent: 3, realReplies: 1, autoReplies: null, positive: null }],
      series: [],
      changes: [],
      agent: "mr-pou",
      publishedAt: "2026-10-30T12:00:00.000Z",
    },
    previousMetrics: [],
  });
  assert.equal(reported.empty, false);
  assert.equal(reported.kpis[0].source, "reporte");
  assert.equal(reported.kpis[0].display, "12");
  assert.equal(reported.kpis[0].delta, "contados a mano");
  assert.equal(reported.table.source, "reporte");
  assert.equal(reported.table.rows[0].sampleNote, "Muestra chica (n = 3)");
  assert.equal(reported.table.rows[0].cells.auto, "—");
});

test("un cambio mal formado no tira el resto del reporte", () => {
  const changes = parseChanges([{ key: "ok", title: "Sirve", status: "en_prueba", result: "  bien  " }, { title: "sin clave" }, null]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].status, "en_prueba");
  assert.equal(changes[0].result, "bien");
});
