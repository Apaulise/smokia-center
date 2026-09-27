/**
 * `address` viene del scraper ya como texto formateado completo (calle +
 * ciudad + provincia + país, según lo devuelva Google Maps) y `city`/`region`
 * son campos aparte del mismo resultado — casi siempre ya están contenidos
 * en `address`. Concatenar los tres sin más repite la ciudad/provincia 2-3
 * veces. Acá se arma la línea de una sola vez, salteando lo que ya aparece
 * en una parte anterior.
 */
export function formatAddress(lead: { address?: string | null; city?: string | null; region?: string | null }): string {
  const parts = [lead.address, lead.city, lead.region].filter((part): part is string => Boolean(part?.trim()));
  const deduped: string[] = [];
  for (const part of parts) {
    const alreadyIncluded = deduped.some((seen) => seen.toLowerCase().includes(part.toLowerCase()));
    if (!alreadyIncluded) deduped.push(part);
  }
  return deduped.join(", ");
}
