import assert from "node:assert/strict";
import { test } from "node:test";

import { addDaysIso, startOfWeekIso } from "../lib/leads/calendar.ts";
import { canPublishWeekly } from "../lib/weekly/access.ts";
import { computeBrand, computeFollowUps, computeProspecting, isPositiveReply, replyClass } from "../lib/weekly/compute.ts";
import { applyAgentResult, applyManualReview, mergeReport, sameReport } from "../lib/weekly/merge.ts";
import { parseChanges } from "../lib/weekly/parse.ts";
import { presentWeekly, formatReplyGapNote } from "../lib/weekly/present.ts";
import { formatResultAt, formatResultMetricLine, formatResultOrigin } from "../lib/weekly/results.ts";
import { camelizeWeekly, changeResultPayload, weeklyPublishPayload } from "../lib/weekly/schema.ts";
import { currentWeekStart, isPublishableWeek, parseWeekStart, weekWindow } from "../lib/weekly/weeks.ts";
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
  assert.equal(week.leadsOpened, 2);
  assert.equal(week.leadsReplied, 1);
});

test("la tasa por lead no cuenta tres mensajes del mismo prospecto, ni la parte 2", () => {
  const humanReply = (leadId, at) =>
    message({
      leadId,
      sender: "LEAD",
      kind: null,
      angle: null,
      variant: null,
      occurredAt: at,
      analysis: human(8),
    });
  const week = computeProspecting(
    [
      message({ leadId: "a", occurredAt: "2026-10-26T15:00:00.000Z", analysis: { opening: { part: 1, type: "reseñas peluquería", variant: "v2" } } }),
      message({
        leadId: "a",
        occurredAt: "2026-10-26T15:01:00.000Z",
        analysis: { opening: { part: 2, type: "reseñas peluquería", variant: "v2" } },
      }),
      humanReply("a", "2026-10-26T18:00:00.000Z"),
      humanReply("a", "2026-10-26T19:00:00.000Z"),
      humanReply("a", "2026-10-27T15:00:00.000Z"),
      message({ leadId: "b", occurredAt: "2026-10-27T15:00:00.000Z", angle: null, variant: null }),
      message({ leadId: "c", occurredAt: "2026-10-27T16:00:00.000Z" }),
      humanReply("d", "2026-10-28T15:00:00.000Z"),
    ],
    WEEK,
    "WHATSAPP",
  );

  assert.equal(week.totals.sent, 3);
  assert.equal(week.totals.realReplies, 4);
  assert.equal(week.leadsOpened, 3);
  assert.equal(week.leadsReplied, 1);
  assert.equal(week.unattributedReplies, 1);
  const reviews = week.byType.find((row) => row.typeLabel === "reseñas peluquería");
  assert.equal(reviews.variantLabel, "v2");
  assert.equal(reviews.sent, 1);
  assert.equal(week.byType.find((row) => row.typeLabel === "Sin tipo").sent, 1);
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

  const futureWeek = addDaysIso(currentWeekStart(new Date()), 7);
  const future = weeklyPublishPayload.safeParse({ area: "x_threads", week: futureWeek, conclusions: "Hola" });
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
  assert.equal(page.kpis.find((kpi) => kpi.key === "unknown").label, "Sin clasificar");
  assert.equal(page.kpis.find((kpi) => kpi.key === "unknown").display, "0");
  assert.equal(page.kpis.find((kpi) => kpi.key === "unattributed").label, "No atribuidas");
  assert.equal(page.kpis.find((kpi) => kpi.key === "lead-rate").display, "—");
  assert.equal(page.kpis.find((kpi) => kpi.key === "lead-rate").delta, "sin aperturas");
  assert.equal(page.table, null);
  assert.equal(page.replyGapNote, null);

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

test("la alerta nombra a quien quedó en Respondió sin mensaje del lead", () => {
  assert.equal(formatReplyGapNote([]), null);
  const note = formatReplyGapNote([
    { leadId: "a", name: "Peluquería Ana", status: "RESPONDIO" },
    { leadId: "b", name: "Barbería Sur", status: "AUTORESPUESTA" },
  ]);
  assert.match(note, /2 leads/);
  assert.match(note, /Peluquería Ana \(Respondió\)/);
  assert.match(note, /Barbería Sur \(Autorespuesta\)/);
  assert.match(note, /no tienen ningún mensaje del lead/);
});

test("un cambio mal formado no tira el resto del reporte", () => {
  const changes = parseChanges([{ key: "ok", title: "Sirve", status: "en_prueba", result: "  bien  " }, { title: "sin clave" }, null]);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].status, "en_prueba");
  assert.equal(changes[0].result, "bien");
});

function blankReport(changes, extra = {}) {
  return {
    conclusions: "Texto.",
    conclusionStatus: "pendiente",
    conclusionResult: null,
    metrics: [],
    messageStats: [],
    series: [],
    changes,
    ...extra,
  };
}

function measure(overrides = {}) {
  return {
    metric: "whatsapp.tasa-humana",
    label: "Tasa humana",
    unit: "percent",
    direction: "up",
    target: "≥ +3 pp",
    baseline: 8,
    baselineWeek: "2026-10-19",
    baselineN: 25,
    startWeek: "2026-10-26",
    weeks: 1,
    source: "crm",
    segment: "variante v3",
    ...overrides,
  };
}

function resultMetric(overrides = {}) {
  return {
    metric: "whatsapp.tasa-humana",
    label: "Tasa humana",
    unit: "percent",
    before: 8,
    after: 12,
    weekBefore: "2026-10-26",
    weekAfter: "2026-11-02",
    nBefore: 25,
    nAfter: 25,
    ...overrides,
  };
}

function agentInput(overrides = {}) {
  return {
    resultText: "Subió 4 pp.",
    resultMetrics: [resultMetric()],
    suggestedStatus: "medido",
    agent: "mr-pou",
    at: "2026-11-02T00:00:00.000Z",
    ...overrides,
  };
}

test("el agente escribe el resultado de un cambio en prueba y no le cambia el estado", () => {
  const change = { key: "reviews-v2", title: "T", detail: "", status: "en_prueba", result: null, measure: measure() };
  const applied = applyAgentResult(change, { ...agentInput(), resultText: "  Subió 4 pp.  " });
  assert.equal(applied.ok, true);
  assert.equal(applied.unchanged, false);
  assert.equal(applied.change.status, "en_prueba");
  assert.equal(applied.change.result, "Subió 4 pp.");
  assert.equal(applied.change.resultSource, "agente");
  assert.equal(applied.change.resultAgent, "mr-pou");
  assert.equal(applied.change.resultAt, "2026-11-02T00:00:00.000Z");
  assert.equal(applied.change.suggestedStatus, "medido");
  assert.equal(applied.change.resultMetrics[0].after, 12);
  assert.equal(applied.change.measure.baseline, 8);

  const again = applyAgentResult(applied.change, agentInput());
  assert.equal(again.ok, true);
  assert.equal(again.unchanged, true);
  assert.equal(again.change.resultAt, "2026-11-02T00:00:00.000Z");
  assert.equal(again.change.status, "en_prueba");

  const cleared = applyAgentResult(applied.change, agentInput({ suggestedStatus: null, at: "2026-11-02T01:00:00.000Z" }));
  assert.equal(cleared.unchanged, false);
  assert.equal(cleared.change.status, "en_prueba");
  assert.equal(cleared.change.suggestedStatus, undefined);

  const kept = applyAgentResult(applied.change, agentInput({ resultText: "Otro texto.", resultMetrics: undefined, at: "2026-11-02T02:00:00.000Z" }));
  assert.equal(kept.change.result, "Otro texto.");
  assert.equal(kept.change.resultMetrics.length, 1);
  assert.equal(kept.change.status, "en_prueba");
});

test("un resultado escrito a mano no se pisa, y pendiente o descartado no se miden", () => {
  const base = { key: "reviews-v2", title: "T", detail: "", status: "en_prueba", result: "Lo vi yo.", resultSource: "manual", resultAt: "2026-11-01T15:00:00.000Z" };
  const manual = applyAgentResult(base, agentInput());
  assert.equal(manual.ok, false);
  assert.equal(manual.code, "manual_result");

  const pending = applyAgentResult({ ...base, resultSource: undefined, status: "pendiente" }, agentInput());
  assert.equal(pending.ok, false);
  assert.equal(pending.code, "not_measurable");

  const discarded = applyAgentResult({ ...base, resultSource: undefined, status: "descartado" }, agentInput());
  assert.equal(discarded.ok, false);
  assert.equal(discarded.code, "not_measurable");

  const approved = applyAgentResult({ ...base, resultSource: undefined, result: null, status: "aprobado" }, agentInput());
  assert.equal(approved.ok, true);
  assert.equal(approved.change.status, "aprobado");
});

test("republicar conserva measure y result, y no reescribe el arco en prueba", () => {
  const existing = blankReport([
    {
      key: "reviews-v2",
      title: "Viejo",
      detail: "antes",
      status: "en_prueba",
      result: "Va bien.",
      measure: measure(),
      resultSource: "agente",
      resultAgent: "mr-pou",
      resultAt: "2026-11-02T00:00:00.000Z",
      resultMetrics: [resultMetric()],
      suggestedStatus: "medido",
    },
  ]);
  const merged = mergeReport(existing, {
    conclusions: "Ahora.",
    metrics: [],
    messageStats: [],
    series: [],
    changes: [
      {
        key: "reviews-v2",
        title: "Nuevo título",
        detail: "después",
        status: "descartado",
        result: "pisa",
        measure: measure({ baseline: 1, target: "otro" }),
      },
    ],
  });
  const change = merged.next.changes.find((item) => item.key === "reviews-v2");
  assert.equal(change.status, "en_prueba");
  assert.equal(change.title, "Nuevo título");
  assert.equal(change.detail, "después");
  assert.equal(change.result, "Va bien.");
  assert.equal(change.resultSource, "agente");
  assert.equal(change.resultAgent, "mr-pou");
  assert.equal(change.suggestedStatus, "medido");
  assert.equal(change.measure.baseline, 8);
  assert.equal(change.measure.target, "≥ +3 pp");
  assert.equal(change.resultMetrics[0].after, 12);

  const missing = mergeReport(blankReport([{ key: "reviews-v2", title: "T", detail: "", status: "en_prueba", result: null }]), {
    conclusions: "Texto.",
    metrics: [],
    messageStats: [],
    series: [],
    changes: [{ key: "reviews-v2", title: "T", detail: "", measure: measure() }],
  });
  assert.equal(missing.next.changes[0].status, "en_prueba");
  assert.equal(missing.next.changes[0].measure.metric, "whatsapp.tasa-humana");

  const approved = mergeReport(
    blankReport([{ key: "reviews-v2", title: "T", detail: "", status: "aprobado", result: null, measure: measure() }]),
    {
      conclusions: "Texto.",
      metrics: [],
      messageStats: [],
      series: [],
      changes: [{ key: "reviews-v2", title: "T", detail: "", measure: measure({ baseline: 9 }) }],
    },
  );
  assert.equal(approved.next.changes[0].status, "aprobado");
  assert.equal(approved.next.changes[0].measure.baseline, 9);

  const measured = mergeReport(
    blankReport([{ key: "reviews-v2", title: "T", detail: "", status: "medido", result: "Listo.", measure: measure() }]),
    {
      conclusions: "Texto.",
      metrics: [],
      messageStats: [],
      series: [],
      changes: [{ key: "reviews-v2", title: "T", detail: "", measure: measure({ baseline: 1 }) }],
    },
  );
  assert.equal(measured.next.changes[0].measure.baseline, 8);
  assert.equal(measured.next.changes[0].result, "Listo.");
});

test("el POST no saca un cambio de pendiente ni aprueba uno nuevo", () => {
  const merged = mergeReport(
    blankReport([{ key: "reviews-v2", title: "T", detail: "", status: "pendiente", result: null }]),
    {
      conclusions: "Texto.",
      metrics: [],
      messageStats: [],
      series: [],
      changes: [{ key: "reviews-v2", title: "T", detail: "", status: "aprobado", result: "listo" }],
    },
  );
  assert.equal(merged.next.changes[0].status, "pendiente");
  assert.equal(merged.next.changes[0].result, "listo");
  assert.equal(merged.next.changes[0].resultSource, undefined);

  const created = mergeReport(null, {
    conclusions: "Texto.",
    metrics: [],
    messageStats: [],
    series: [],
    changes: [{ key: "nuevo", title: "Nuevo", detail: "", status: "medido", measure: measure() }],
  });
  assert.equal(created.next.changes[0].status, "pendiente");
  assert.equal(created.next.changes[0].measure.metric, "whatsapp.tasa-humana");

  const manual = mergeReport(
    blankReport([
      {
        key: "reviews-v2",
        title: "T",
        detail: "",
        status: "pendiente",
        result: "Lo escribí yo.",
        resultSource: "manual",
        resultAt: "2026-11-01T18:00:00.000Z",
      },
    ]),
    {
      conclusions: "Texto.",
      metrics: [],
      messageStats: [],
      series: [],
      changes: [{ key: "reviews-v2", title: "T", detail: "", status: "en_prueba", result: "del agente" }],
    },
  );
  assert.equal(manual.next.changes[0].status, "pendiente");
  assert.equal(manual.next.changes[0].result, "Lo escribí yo.");
  assert.equal(manual.next.changes[0].resultSource, "manual");

  const incoming = {
    conclusions: "Texto.",
    metrics: [],
    messageStats: [],
    series: [],
    changes: [{ key: "reviews-v2", title: "T", detail: "d", measure: measure() }],
  };
  const first = mergeReport(null, incoming).next;
  const second = mergeReport(first, incoming).next;
  assert.equal(sameReport(first, second), true);
});

test("parseChanges no pierde measure ni el resultado automático", () => {
  const changes = parseChanges([
    {
      key: "reviews-v2",
      title: "T",
      status: "en_prueba",
      result: " bien ",
      measure: measure(),
      resultSource: "agente",
      resultAgent: "Mr-Pou",
      resultAt: "2026-11-02T00:00:00.000Z",
      resultMetrics: [resultMetric(), { metric: "rota" }],
      suggestedStatus: "medido",
      extra: "se pierde",
    },
    { key: "sin-medida", title: "Sigue", measure: { metric: "no" } },
  ]);
  assert.equal(changes.length, 2);
  assert.equal(changes[0].result, "bien");
  assert.equal(changes[0].measure.metric, "whatsapp.tasa-humana");
  assert.equal(changes[0].measure.segment, "variante v3");
  assert.equal(changes[0].resultSource, "agente");
  assert.equal(changes[0].resultAgent, "mr-pou");
  assert.equal(changes[0].resultMetrics.length, 1);
  assert.equal(changes[0].suggestedStatus, "medido");
  assert.equal(changes[0].extra, undefined);
  assert.equal(changes[1].measure, undefined);
  assert.equal(changes[1].status, "pendiente");
});

test("el payload acepta cómo se mide y el resultado de un cambio", () => {
  const published = weeklyPublishPayload.safeParse(
    camelizeWeekly({
      area: "whatsapp",
      week: "2026-10-26",
      conclusions: "Texto.",
      changes: [
        {
          key: "reviews-v2",
          title: "Dejar la variante",
          status: "aprobado",
          measure: {
            metric: "whatsapp.tasa-humana",
            label: "Tasa humana",
            unit: "percent",
            direction: "up",
            baseline: 8,
            baseline_week: "2026-10-19",
            start_week: "2026-10-26",
            weeks: 1,
            source: "crm",
          },
        },
      ],
    }),
  );
  assert.equal(published.success, true);
  if (published.success) {
    assert.equal(published.data.changes[0].measure.baselineWeek, "2026-10-19");
    assert.equal(published.data.changes[0].status, "aprobado");
  }

  const result = changeResultPayload.safeParse(
    camelizeWeekly({
      agent: "mr-pou",
      area: "whatsapp",
      week: "2026-W44",
      key: "reviews-v2",
      result_text: "Subió.",
      suggested_status: "medido",
      result_metrics: [
        {
          metric: "whatsapp.tasa-humana",
          label: "Tasa humana",
          unit: "percent",
          before: 8,
          after: 12,
          week_before: "2026-10-26",
          week_after: "2026-11-02",
          n_before: 25,
          n_after: 25,
        },
      ],
    }),
  );
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.weekStart, WEEK);
    assert.equal(result.data.resultText, "Subió.");
    assert.equal(result.data.suggestedStatus, "medido");
    assert.equal(result.data.resultMetrics[0].nBefore, 25);
    assert.equal(result.data.resultMetrics[0].weekAfter, "2026-11-02");
  }

  const bad = changeResultPayload.safeParse({ area: "whatsapp", week: "2026-10-26", key: "no vale", resultText: "x" });
  assert.equal(bad.success, false);
});

test("el origen, las métricas y la semana anterior se leen en la pantalla nueva", () => {
  assert.equal(formatResultAt("2026-11-02T00:00:00.000Z"), "dom 01/11 21:00 (UTC-3)");
  assert.equal(formatResultAt("2026-11-01T21:00:00-03:00"), "dom 01/11 21:00 (UTC-3)");
  assert.equal(
    formatResultOrigin({ resultSource: "agente", resultAgent: "mr-pou", resultAt: "2026-11-02T00:00:00.000Z" }),
    "Automático · mr-pou · dom 01/11 21:00 (UTC-3)",
  );
  assert.equal(formatResultOrigin({ resultSource: "manual", resultAt: "2026-11-02T00:00:00.000Z" }), "Editado a mano");
  assert.equal(formatResultOrigin({ result: "viejo" }), null);
  assert.equal(formatResultMetricLine(resultMetric()), "Tasa humana: 8% (26/10) → 12% (02/11), n 25/25");

  const reviewed = applyManualReview(
    {
      key: "reviews-v2",
      title: "T",
      detail: "",
      status: "en_prueba",
      result: "Subió.",
      resultSource: "agente",
      resultAgent: "mr-pou",
      resultMetrics: [resultMetric()],
      suggestedStatus: "medido",
      measure: measure(),
    },
    { status: "medido", result: "Lo confirmo.", at: "2026-11-02T12:00:00.000Z" },
  );
  assert.equal(reviewed.status, "medido");
  assert.equal(reviewed.resultSource, "manual");
  assert.equal(reviewed.resultAgent, undefined);
  assert.equal(reviewed.suggestedStatus, undefined);
  assert.equal(reviewed.resultMetrics[0].after, 12);
  assert.equal(reviewed.measure.metric, "whatsapp.tasa-humana");
  assert.equal(formatResultOrigin(reviewed), "Editado a mano");

  const page = presentWeekly({
    area: weeklyArea("whatsapp"),
    weekStart: "2026-11-02",
    weeks: ["2026-11-02"],
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
    previousReport: {
      id: "prev",
      area: "whatsapp",
      weekStart: WEEK,
      conclusions: "",
      conclusionStatus: "pendiente",
      conclusionResult: null,
      metrics: [],
      messageStats: [],
      series: [],
      changes: [
        { key: "a", title: "En prueba", detail: "", status: "en_prueba", result: "Subió." },
        { key: "b", title: "Pendiente", detail: "", status: "pendiente", result: "todavía no" },
        { key: "c", title: "Sin texto", detail: "", status: "aprobado", result: null },
        { key: "d", title: "Descartado", detail: "", status: "descartado", result: "no va" },
      ],
      agent: "mr-pou",
      publishedAt: "2026-11-01T00:00:00.000Z",
    },
  });
  assert.equal(page.priorResults.weekStart, WEEK);
  assert.equal(page.priorResults.changes.length, 1);
  assert.equal(page.priorResults.changes[0].key, "a");
});
