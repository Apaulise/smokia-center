import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canReply,
  formatWindowLeft,
  HUMAN_AGENT_WINDOW_MS,
  OPEN_WINDOW_MS,
  replyWindow,
  sendTagFields,
  windowLabel,
} from "../lib/chats/window.ts";

const NOW = Date.parse("2026-11-13T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const HOUR = 60 * 60 * 1000;

test("hasta 24 h se responde libre y no lleva etiqueta", () => {
  const window = replyWindow(ago(2 * HOUR), NOW);
  assert.equal(window.state, "open");
  assert.equal(window.msLeft, 22 * HOUR);
  assert.equal(canReply(window), true);
  assert.deepEqual(sendTagFields(window), {});
});

test("de 24 h a 7 días sólo con HUMAN_AGENT", () => {
  const window = replyWindow(ago(30 * HOUR), NOW);
  assert.equal(window.state, "human_agent");
  assert.equal(canReply(window), true);
  assert.deepEqual(sendTagFields(window), { messagingType: "MESSAGE_TAG", messageTag: "HUMAN_AGENT" });
});

test("pasados los 7 días no se puede responder", () => {
  const window = replyWindow(ago(8 * 24 * HOUR), NOW);
  assert.equal(window.state, "closed");
  assert.equal(canReply(window), false);
  assert.deepEqual(sendTagFields(window), {});
});

test("sin mensaje del cliente tampoco se puede (en Instagram siempre abre la persona)", () => {
  for (const value of [null, undefined, "no-es-una-fecha"]) {
    const window = replyWindow(value, NOW);
    assert.equal(window.state, "none");
    assert.equal(canReply(window), false);
  }
});

test("los límites exactos: 24 h ya es HUMAN_AGENT, 7 días ya está cerrada", () => {
  assert.equal(replyWindow(ago(OPEN_WINDOW_MS - 1), NOW).state, "open");
  assert.equal(replyWindow(ago(OPEN_WINDOW_MS), NOW).state, "human_agent");
  assert.equal(replyWindow(ago(HUMAN_AGENT_WINDOW_MS - 1), NOW).state, "human_agent");
  assert.equal(replyWindow(ago(HUMAN_AGENT_WINDOW_MS), NOW).state, "closed");
});

test("los textos dicen cuánto queda y por qué no se puede", () => {
  assert.equal(formatWindowLeft(20 * 60_000), "20 min");
  assert.equal(formatWindowLeft(5 * HOUR), "5 h");
  assert.equal(formatWindowLeft(3 * 24 * HOUR), "3 días");
  assert.match(windowLabel(replyWindow(ago(HOUR), NOW)), /libremente/);
  assert.match(windowLabel(replyWindow(ago(30 * HOUR), NOW)), /una persona/);
  assert.match(windowLabel(replyWindow(ago(9 * 24 * HOUR), NOW)), /7 días/);
  assert.match(windowLabel(replyWindow(null, NOW)), /primer mensaje/);
});
