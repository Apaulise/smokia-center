// Texto de búsqueda listo para PostgREST. Puro, para probarlo solo (tests/leads-search.test.mjs).

/**
 * Lo escrito en el buscador, listo para un `or(...)` de PostgREST: sin coma,
 * paréntesis, comillas, `:` ni `*` (arman o rompen la expresión: «Estética
 * (Córdoba)» hacía fallar la pantalla entera) y con los comodines de LIKE
 * escapados, así «juan_perez» busca eso y no «juan cualquier-letra perez».
 */
export function orSafeTerm(value: string): string {
  return value
    .replace(/[,()"':*]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .replace(/[\\%_]/g, (char) => `\\${char}`);
}
