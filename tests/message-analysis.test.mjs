import assert from "node:assert/strict";
import test from "node:test";

import { messageAnalysisDetails, withReviewedResponseType } from "../lib/leads/message-analysis.ts";

const analysis = {
  analysis: {
    response_type: "AUTORESPUESTA",
    what_happened: "Se recibió una respuesta automática.",
    learned: null,
    interest_level: 0,
    wants_meeting: false,
    disqualify: false,
    not_now: false,
    not_now_reason: null,
    not_now_opportunity: null,
    follow_up_date: null,
  },
  crm_update: { signals: [] },
  strategy: { reasoning: "Esperar una respuesta humana." },
  suggested_reply: { message: "", has_reply: false },
};

test("la revisión conserva la clasificación original de la IA", () => {
  const first = withReviewedResponseType(analysis, "HUMANA", "2026-10-27T10:00:00.000Z");
  const second = withReviewedResponseType(first, "AUTORESPUESTA", "2026-10-27T11:00:00.000Z");
  const details = messageAnalysisDetails(second);

  assert.equal(details?.aiResponseType, "AUTORESPUESTA");
  assert.equal(details?.effectiveResponseType, "AUTORESPUESTA");
  assert.equal(details?.reviewedAt, "2026-10-27T11:00:00.000Z");
});

test("una corrección humana pasa a ser el tipo efectivo usado por métricas", () => {
  const reviewed = withReviewedResponseType(analysis, "HUMANA", "2026-10-27T10:00:00.000Z");
  const details = messageAnalysisDetails(reviewed);

  assert.equal(details?.aiResponseType, "AUTORESPUESTA");
  assert.equal(details?.effectiveResponseType, "HUMANA");
  assert.equal(details?.analysis.analysis.response_type, "HUMANA");
});

test("un JSON sin análisis válido no puede ser revisado", () => {
  assert.equal(messageAnalysisDetails({ response_type: "HUMANA" }), null);
  assert.equal(withReviewedResponseType(null, "HUMANA", "2026-10-27T10:00:00.000Z"), null);
});
