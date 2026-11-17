import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyConversationChange,
  awaitingReply,
  fillQuickReply,
  filterCounts,
  filterItems,
  sortItems,
  upsertThreadMessage,
} from "../lib/chats/inbox.ts";
import { audioMimeOf, fileKindOf, fileMimeOf, fileSizeLimit, formatDuration, formatFileSize, matchQuickReplies, sendableNoun } from "../lib/chats/quick-replies.ts";
import { describeTag, filterTags, labelMap, normalizeTag, orderTags, PRESET_TAGS, stageOf } from "../lib/chats/tag-view.ts";
import { downmix, encodeWav, resample } from "../lib/chats/wav.ts";

const NOW = Date.parse("2026-11-14T18:00:00Z");
const hoursAgo = (h) => new Date(NOW - h * 3_600_000).toISOString();

function item(overrides = {}) {
  return {
    id: "c1",
    owner_id: "o",
    channel_account_id: "a",
    channel: "INSTAGRAM",
    participant_handle: "ana.perez",
    participant_name: "Ana Pérez",
    participant_picture: null,
    participant_external_id: "123",
    lead_id: null,
    status: "ACTIVA",
    last_message_at: hoursAgo(1),
    last_message_preview: "hola",
    last_inbound_at: hoursAgo(1),
    unread_count: 0,
    thread_owner: null,
    participant_profile: null,
    zernio_contact_id: null,
    tags: [],
    follow_up_at: null,
    follow_up_note: null,
    source_automation_id: null,
    lead_name: null,
    lead_status: null,
    ...overrides,
  };
}

test("le toca responder a uno si el último mensaje es de la persona", () => {
  assert.equal(awaitingReply(item()), true);
  assert.equal(awaitingReply(item({ last_inbound_at: hoursAgo(3) })), false);
  assert.equal(awaitingReply(item({ last_inbound_at: null })), false);
});

test("filtros de cliente: por responder, ventana por cerrar, seguimiento, etiqueta y búsqueda sin tildes", () => {
  const items = [
    item({ id: "a" }),
    item({ id: "b", last_inbound_at: hoursAgo(20), last_message_at: hoursAgo(20) }),
    item({ id: "c", last_inbound_at: hoursAgo(30), last_message_at: hoursAgo(2), tags: ["tofu"], follow_up_at: hoursAgo(1) }),
  ];
  const view = (filter, extra = {}) => filterItems(items, { filter, search: "", tag: null, ...extra }, NOW).map((x) => x.id);
  assert.deepEqual(view("por_responder"), ["a", "b"]);
  assert.deepEqual(view("ventana"), ["b"]);
  assert.deepEqual(view("seguimiento"), ["c"]);
  assert.deepEqual(view("todas", { tag: "tofu" }), ["c"]);
  assert.deepEqual(view("todas", { search: "perez" }), ["a", "b", "c"]);
  assert.deepEqual(filterCounts(items, NOW), { sin_leer: 0, por_responder: 2, ventana: 1, seguimiento: 1 });
});

test("Realtime: actualiza y reordena, saca lo archivado y pide recargar si la conversación es nueva", () => {
  const items = sortItems([item({ id: "a", last_message_at: hoursAgo(5) }), item({ id: "b", last_message_at: hoursAgo(2) })]);
  const moved = applyConversationChange(items, { id: "a", last_message_at: hoursAgo(0), unread_count: 2, tags: ["mofu"] }, "activas");
  assert.deepEqual(moved.map((x) => x.id), ["a", "b"]);
  assert.equal(moved[0].unread_count, 2);
  assert.deepEqual(moved[0].tags, ["mofu"]);
  assert.deepEqual(applyConversationChange(items, { id: "a", status: "ARCHIVADA" }, "activas").map((x) => x.id), ["b"]);
  assert.equal(applyConversationChange(items, { id: "z", status: "ACTIVA" }, "activas"), null);
});

test("el mensaje que vuelve de la base reemplaza al optimista en vez de duplicarlo", () => {
  const local = { id: "local-1", direction: "OUT", body: "hola", occurred_at: hoursAgo(0), local: "sending", attachments: [] };
  const saved = { id: "m1", direction: "OUT", body: "hola", occurred_at: hoursAgo(0), attachments: [] };
  const merged = upsertThreadMessage([local], saved);
  assert.deepEqual(merged.map((m) => m.id), ["m1"]);
  assert.equal(upsertThreadMessage(merged, saved).length, 1);
});

test("respuestas rápidas: {{nombre}}, búsqueda por título y formatos de audio", () => {
  assert.equal(fillQuickReply("Hola {{nombre}}, ¿cómo va?", "Ana Pérez", "ana"), "Hola Ana, ¿cómo va?");
  assert.equal(fillQuickReply("Hola {{nombre}}!", null, "juan.gomez"), "Hola juan!");
  const items = [
    { id: "1", kind: "TEXTO", title: "Precio", body: "cuesta", previewUrl: null, durationMs: null, useCount: 0 },
    { id: "2", kind: "AUDIO", title: "Saludo", body: null, previewUrl: null, durationMs: 4200, useCount: 3 },
  ];
  assert.deepEqual(matchQuickReplies(items, "sal").map((x) => x.id), ["2"]);
  assert.deepEqual(matchQuickReplies(items, "").map((x) => x.id), ["2", "1"]);
  assert.equal(audioMimeOf("", "nota.m4a"), "audio/mp4");
  assert.equal(audioMimeOf("audio/webm", "nota.webm"), null);
  assert.equal(formatDuration(65_000), "1:05");
});

test("etiquetas: etapa desde el catálogo o el texto, y normalización", () => {
  const labels = labelMap([{ tag: "manos-respondio", label: "Respondió MANOS", stage: "MOFU", sort_order: 1 }]);
  assert.equal(describeTag("manos-respondio", labels).label, "Respondió MANOS");
  assert.equal(describeTag("kw-fable", labels).label, "Palabra: fable");
  assert.equal(stageOf(["tofu", "manos-respondio"], labels), "MOFU");
  assert.equal(stageOf(["tofu", "lead-calificado"], labels), "BOFU");
  // "agenda" (la que ponen los workflows modelo TOFU/MOFU al calificar) también es BOFU.
  assert.equal(stageOf(["mofu", "agenda"], labels), "BOFU");
  assert.equal(normalizeTag("  Lead Calificado ñ "), "lead-calificado-n");
});

test("WAV: cabecera RIFF mono 16 bits y tamaño correcto", () => {
  const samples = resample(downmix([new Float32Array([0, 0.5, -0.5, 1]), new Float32Array([0, 0.5, -0.5, 1])]), 44_100, 22_050);
  const wav = encodeWav(samples, 22_050);
  const text = (offset) => String.fromCharCode(...wav.slice(offset, offset + 4));
  const view = new DataView(wav.buffer);
  assert.equal(text(0), "RIFF");
  assert.equal(text(8), "WAVE");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 22_050);
  assert.equal(view.getUint32(40, true), samples.length * 2);
  assert.equal(wav.length, 44 + samples.length * 2);
});

test("etiquetas predefinidas: color, nombre, orden y filtro siempre presente", () => {
  const labels = labelMap([{ tag: "manos-respondio", label: "Respondió MANOS", stage: "MOFU", sort_order: 1 }]);
  assert.deepEqual(
    PRESET_TAGS.map((preset) => [preset.tag, preset.color]),
    [["agenda", "green"], ["negocio", "blue"], ["curioso", "red"], ["seguimiento", "yellow"]],
  );
  // El texto es el que escriben los workflows; el nombre y el color salen del predefinido.
  assert.deepEqual(describeTag("negocio", labels), { tag: "negocio", label: "Negocio", stage: null, keyword: false, color: "blue" });
  assert.equal(describeTag("agenda", labels).color, "green");
  // Una etiqueta cualquiera no tiene color, tenga o no etapa.
  assert.equal(describeTag("manos-respondio", labels).color, null);
  assert.equal(describeTag("tofu", labels).color, null);
  // Las predefinidas van primero y en su orden, pase lo que pase con las demás.
  assert.deepEqual(
    orderTags(["kw-fable", "seguimiento", "manos-respondio", "curioso", "agenda"], labels).map((view) => view.tag),
    ["agenda", "curioso", "seguimiento", "manos-respondio", "kw-fable"],
  );
  // El filtro de la bandeja las muestra siempre, con 0 si nadie la tiene.
  assert.deepEqual(filterTags([{ tag: "tofu", count: 5 }, { tag: "negocio", count: 2 }]), [
    { tag: "agenda", count: 0 },
    { tag: "negocio", count: 2 },
    { tag: "curioso", count: 0 },
    { tag: "seguimiento", count: 0 },
    { tag: "tofu", count: 5 },
  ]);
});

test("respuestas rápidas: documentos e imágenes que acepta Instagram", () => {
  assert.equal(fileMimeOf("image/png", "foto.png"), "image/png");
  assert.equal(fileMimeOf("image/jpg", "foto.jpg"), "image/jpeg");
  // Algunos sistemas suben sin tipo: se deduce de la extensión.
  assert.equal(fileMimeOf("", "Propuesta.PDF"), "application/pdf");
  assert.equal(fileMimeOf("application/octet-stream", "foto.jpeg"), "image/jpeg");
  // Lo que Instagram no acepta por DM se rechaza antes de subirlo.
  assert.equal(fileMimeOf("image/webp", "foto.webp"), null);
  assert.equal(fileMimeOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document", "propuesta.docx"), null);
  assert.equal(fileKindOf("image/gif"), "image");
  assert.equal(fileKindOf("application/pdf"), "document");
  assert.equal(fileSizeLimit("image/png"), 8 * 1024 * 1024);
  assert.equal(fileSizeLimit("application/pdf"), 25 * 1024 * 1024);
  assert.equal(formatFileSize(340 * 1024), "340 KB");
  assert.equal(formatFileSize(1.25 * 1024 * 1024), "1,3 MB");
  assert.equal(formatFileSize(0), "");
  assert.equal(sendableNoun({ kind: "AUDIO", mime: "audio/wav" }), "el audio");
  assert.equal(sendableNoun({ kind: "ARCHIVO", mime: "image/png" }), "la imagen");
  assert.equal(sendableNoun({ kind: "ARCHIVO", mime: "application/pdf" }), "el documento");
  // El buscador de la barra también encuentra un archivo por su nombre original.
  const items = [
    { id: "a", kind: "TEXTO", title: "Saludo", body: "Hola {{nombre}}", useCount: 0 },
    { id: "b", kind: "ARCHIVO", title: "Propuesta", body: null, fileName: "smokia-servicios.pdf", useCount: 0 },
  ];
  assert.deepEqual(matchQuickReplies(items, "servicios").map((x) => x.id), ["b"]);
});

