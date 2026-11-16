import assert from "node:assert/strict";
import { test } from "node:test";

import { attachmentLabel, formatChatTime, initialsOf, previewOf, readAttachments } from "../lib/chats/format.ts";

test("una mención en historia no se muestra como un archivo genérico", () => {
  assert.equal(attachmentLabel("share", "story_mention"), "Te mencionó en su historia");
  assert.equal(attachmentLabel("share", "ig_reel"), "Reel compartido");
  assert.equal(attachmentLabel("share"), "Contenido compartido");
  assert.equal(attachmentLabel("image"), "Imagen");
  assert.equal(attachmentLabel("raro"), "Adjunto");
});

test("readAttachments no confía en la forma del jsonb y sólo acepta URLs https", () => {
  assert.deepEqual(readAttachments(null), []);
  assert.deepEqual(readAttachments({}), []);
  const views = readAttachments([{ type: "image", url: "https://cdn.example.com/a.jpg" }, { type: "video", url: "javascript:alert(1)" }, "basura", null]);
  assert.equal(views.length, 2);
  assert.equal(views[0].url, "https://cdn.example.com/a.jpg");
  assert.equal(views[1].url, null);
});

test("previewOf: texto recortado o el adjunto entre corchetes", () => {
  assert.equal(previewOf("  hola   mundo \n que tal ", []), "hola mundo que tal");
  assert.equal(previewOf("x".repeat(200), []).length, 140);
  assert.equal(previewOf(null, [{ type: "image" }]), "[imagen]");
  assert.equal(previewOf("", [{ type: "share", originalType: "story_mention" }]), "[te mencionó en su historia]");
  assert.equal(previewOf(null, []), null);
});

test("iniciales para el avatar", () => {
  assert.equal(initialsOf("Sofía Pérez", null), "SP");
  assert.equal(initialsOf(null, "estudio.demo"), "ED");
  assert.equal(initialsOf("", ""), "?");
});

test("formatChatTime: hora si es de hoy, fecha corta si es vieja", () => {
  const now = new Date("2026-11-13T15:00:00.000Z");
  assert.match(formatChatTime("2026-11-13T13:30:00.000Z", now), /^\d{2}:\d{2}$/);
  // El relleno con ceros depende de los datos de idioma de cada Node: sólo se fija día/mes.
  assert.match(formatChatTime("2026-10-01T13:30:00.000Z", now), /^\d{1,2}\/\d{1,2}$/);
  assert.equal(formatChatTime(null, now), "");
  assert.equal(formatChatTime("basura", now), "");
});
