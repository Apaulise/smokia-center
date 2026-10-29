import assert from "node:assert/strict";
import test from "node:test";

import {
  EMAIL_MESSAGE_MAX_LENGTH,
  leadMessageLimit,
  leadMessageLimitError,
  SHORT_MESSAGE_MAX_LENGTH,
} from "../lib/leads/message-limits.ts";

test("email admite mensajes largos sin cambiar el límite de los canales breves", () => {
  assert.equal(leadMessageLimit("EMAIL"), EMAIL_MESSAGE_MAX_LENGTH);
  assert.equal(leadMessageLimit("WHATSAPP"), SHORT_MESSAGE_MAX_LENGTH);
  assert.equal(leadMessageLimit("INSTAGRAM"), SHORT_MESSAGE_MAX_LENGTH);
});

test("el error explica el canal y el límite permitido", () => {
  assert.equal(leadMessageLimitError("EMAIL"), "El mensaje por email puede tener hasta 3.000 caracteres.");
  assert.equal(leadMessageLimitError("WHATSAPP"), "El mensaje por WhatsApp puede tener hasta 600 caracteres.");
});
