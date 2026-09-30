import { STYLE_EDIT_MIN_DISTANCE, STYLE_EDIT_MIN_RATIO } from "@/lib/leads/ai/style/constants";

/**
 * Cuánto cambió el humano el borrador de la IA (Plan §1.20.1). Sin
 * dependencias nuevas: los dos textos están capados en 600 caracteres por los
 * Zod de confirmLeadOpening/confirmMessageSent, así que el peor caso del DP es
 * irrelevante.
 */

/**
 * Normaliza para comparar, NO para guardar. Unifica espacios y saca los
 * invisibles que mete el copiar/pegar, pero deja mayúsculas y puntuación:
 * borrar una coma o un signo de apertura ES la señal que se quiere aprender.
 */
export function normalizeForDiff(text: string): string {
  return text
    .normalize("NFC")
    .replace(/[​-‍﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Levenshtein clásico con dos filas — O(n·m) en tiempo, O(m) en memoria. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  let curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }

  return prev[b.length];
}

/** La distancia que se persiste en `lead_messages.edit_distance`. 0 = no lo tocó. */
export function editDistance(generated: string, sent: string): number {
  return levenshtein(normalizeForDiff(generated), normalizeForDiff(sent));
}

/**
 * Si esa distancia alcanza para tratarlo como ejemplo de estilo. Las dos
 * condiciones a la vez: absoluta para que un typo no cuente, y proporcional
 * para que en un mensaje corto haga falta menos.
 */
export function isRealEdit(distance: number, sentLength: number): boolean {
  return distance >= STYLE_EDIT_MIN_DISTANCE && distance >= sentLength * STYLE_EDIT_MIN_RATIO;
}
