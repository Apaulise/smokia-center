// Cómo se muestra una etiqueta de Zernio en SmokIA (§1.26). La etiqueta en sí
// es el texto que puso el workflow (`manos-respondio`, `lead-calificado`,
// `tofu`…). El catálogo `chat_tag_labels` le da un nombre lindo y una etapa del
// embudo; si no está en el catálogo, se deduce lo que se pueda del texto.
//
// Las cuatro predefinidas (`PRESET_TAGS`) son las que ponen los workflows
// modelo TOFU/MOFU y las únicas con color propio: siempre están para elegir,
// aunque todavía nadie las tenga.

import type { FunnelStage, TagLabelRow } from "@/lib/chats/db";

export type TagColor = "green" | "blue" | "red" | "yellow";

export type TagView = { tag: string; label: string; stage: FunnelStage | null; keyword: boolean; color: TagColor | null };

export type PresetTag = { tag: string; label: string; color: TagColor; hint: string };

/**
 * Etiquetas predefinidas (decisión del dueño, 2026-11-16): Agenda en verde,
 * Negocio en azul, Curioso en rojo y Seguimiento en amarillo. El texto es el
 * mismo que escriben los workflows de Zernio, así que una puesta a mano y una
 * puesta por un workflow son la misma etiqueta. El orden es el de la lista.
 */
export const PRESET_TAGS: readonly PresetTag[] = [
  { tag: "agenda", label: "Agenda", color: "green", hint: "Respondió todo: lista para agendar la llamada" },
  { tag: "negocio", label: "Negocio", color: "blue", hint: "Tiene un negocio: es un posible cliente" },
  { tag: "curioso", label: "Curioso", color: "red", hint: "Lo quiere para sí: hoy no es un cliente" },
  { tag: "seguimiento", label: "Seguimiento", color: "yellow", hint: "No respondió: hay que volver a escribirle" },
];

const PRESET_BY_TAG = new Map(PRESET_TAGS.map((preset, index) => [preset.tag, { ...preset, index }]));

export function presetOf(tag: string): PresetTag | null {
  return PRESET_BY_TAG.get(tag.toLowerCase()) ?? null;
}

/** Prefijo de las etiquetas que ALTAB pone por pieza: `kw-manos` = llegó comentando "manos". */
export const KEYWORD_TAG_PREFIX = "kw-";

const STAGE_RANK: Record<FunnelStage, number> = { TOFU: 1, MOFU: 2, BOFU: 3 };

function humanize(tag: string): string {
  const text = tag.replace(/[-_]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : tag;
}

function stageFromText(tag: string): FunnelStage | null {
  const match = /^(tofu|mofu|bofu)(\b|[-_])/i.exec(tag);
  if (match) return match[1].toUpperCase() as FunnelStage;
  // Las de calificación que ya usa el embudo: un lead calificado, o listo para agendar, está en el fondo.
  if (/^lead[-_]calificado$/i.test(tag) || /^agenda$/i.test(tag)) return "BOFU";
  return null;
}

export function describeTag(tag: string, labels: Map<string, TagLabelRow>): TagView {
  const row = labels.get(tag);
  const preset = presetOf(tag);
  const keyword = tag.toLowerCase().startsWith(KEYWORD_TAG_PREFIX);
  const label = row?.label?.trim() || preset?.label || (keyword ? `Palabra: ${tag.slice(KEYWORD_TAG_PREFIX.length)}` : humanize(tag));
  return { tag, label, stage: row?.stage ?? stageFromText(tag), keyword, color: preset?.color ?? null };
}

export function labelMap(rows: TagLabelRow[]): Map<string, TagLabelRow> {
  return new Map(rows.map((row) => [row.tag, row]));
}

/** La etapa más avanzada entre las etiquetas de un contacto (o `null`). */
export function stageOf(tags: string[], labels: Map<string, TagLabelRow>): FunnelStage | null {
  let best: FunnelStage | null = null;
  for (const tag of tags) {
    const stage = describeTag(tag, labels).stage;
    if (stage && (!best || STAGE_RANK[stage] > STAGE_RANK[best])) best = stage;
  }
  return best;
}

function rank(view: TagView, labels: Map<string, TagLabelRow>): number {
  const preset = PRESET_BY_TAG.get(view.tag.toLowerCase());
  if (preset) return preset.index;
  const order = labels.get(view.tag)?.sort_order;
  if (order !== undefined) return 10 + order;
  return view.keyword ? 100_000 : view.stage ? 5000 : 10_000;
}

/**
 * Ordena para mostrar: primero las predefinidas (en su orden), después las del
 * catálogo (en el suyo), las de etapa y las de palabra clave al final. Las
 * demás alfabético.
 */
export function orderTags(tags: string[], labels: Map<string, TagLabelRow>): TagView[] {
  return tags
    .map((tag) => describeTag(tag, labels))
    .sort((a, b) => rank(a, labels) - rank(b, labels) || a.label.localeCompare(b.label));
}

/**
 * Las etiquetas para el filtro de la bandeja: las cuatro predefinidas siempre
 * (con 0 si nadie la tiene) y después las demás que estén en uso, de la más
 * usada a la menos. Tocar la elegida en la bandeja la saca.
 */
export function filterTags(inUse: Array<{ tag: string; count: number }>): Array<{ tag: string; count: number }> {
  const counts = new Map(inUse.map((entry) => [entry.tag, entry.count]));
  const presets = PRESET_TAGS.map((preset) => ({ tag: preset.tag, count: counts.get(preset.tag) ?? 0 }));
  return [...presets, ...inUse.filter((entry) => !presetOf(entry.tag))];
}

/** Normaliza una etiqueta escrita a mano para que coincida con las de los workflows. */
export function normalizeTag(value: string): string | null {
  const tag = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9:_-]/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 48);
  return tag || null;
}
