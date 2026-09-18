/**
 * Lectura defensiva de filas de Windsor: son `unknown` porque un conector
 * devuelve los campos que se le pidieron y cambia de forma sin avisar, mismo
 * criterio que lib/providers/utils.ts para Apify (CLAUDE.md §5). Se duplica
 * en vez de importarse de ahí para no acoplar Marca a un módulo de Leads.
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function firstString(row: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}
