// Cómo se muestra una etiqueta de Zernio en SmokIA (§1.26). La etiqueta en sí
// es el texto que puso el workflow (`manos-respondio`, `lead-calificado`,
// `tofu`…). El catálogo `chat_tag_labels` le da un nombre lindo y una etapa del
// embudo; si no está en el catálogo, se deduce lo que se pueda del texto.

import type { FunnelStage, TagLabelRow } from "@/lib/chats/db";

export type TagView = { tag: string; label: string; stage: FunnelStage | null; keyword: boolean };

/** Prefijo de las etiquetas que SmokIA pone por pieza: `kw-manos` = llegó comentando "manos". */
export const KEYWORD_TAG_PREFIX = "kw-";

const STAGE_RANK: Record<FunnelStage, number> = { TOFU: 1, MOFU: 2, BOFU: 3 };

function humanize(tag: string): string {
  const text = tag.replace(/[-_]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : tag;
}

function stageFromText(tag: string): FunnelStage | null {
  const match = /^(tofu|mofu|bofu)(\b|[-_])/i.exec(tag);
  if (match) return match[1].toUpperCase() as FunnelStage;
  // Las de calificación que ya usa el embudo: un lead calificado está en el fondo.
  if (/^lead[-_]calificado$/i.test(tag)) return "BOFU";
  return null;
}

export function describeTag(tag: string, labels: Map<string, TagLabelRow>): TagView {
  const row = labels.get(tag);
  const keyword = tag.toLowerCase().startsWith(KEYWORD_TAG_PREFIX);
  const label = row?.label?.trim() || (keyword ? `Palabra: ${tag.slice(KEYWORD_TAG_PREFIX.length)}` : humanize(tag));
  return { tag, label, stage: row?.stage ?? stageFromText(tag), keyword };
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

/**
 * Ordena para mostrar: primero las del catálogo (en su orden), después las de
 * etapa, las de palabra clave al final. Las demás alfabético.
 */
export function orderTags(tags: string[], labels: Map<string, TagLabelRow>): TagView[] {
  return tags
    .map((tag) => describeTag(tag, labels))
    .sort((a, b) => {
      const ra = labels.get(a.tag)?.sort_order ?? (a.keyword ? 10_000 : a.stage ? 500 : 1000);
      const rb = labels.get(b.tag)?.sort_order ?? (b.keyword ? 10_000 : b.stage ? 500 : 1000);
      return ra - rb || a.label.localeCompare(b.label);
    });
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
