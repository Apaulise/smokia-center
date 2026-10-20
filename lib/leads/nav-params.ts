/**
 * Contexto de navegación de la ficha: los filtros y el orden con los que se
 * abrió el lead desde la tabla/kanban de una lista. Viajan en la URL de la
 * ficha para que anterior/siguiente recorra exactamente esa selección.
 */
export const NAV_PARAM_KEYS = ["industryId", "status", "city", "q", "sort", "dir"] as const;

type ParamSource = { get(key: string): string | null };

/** Query string (sin "?") con sólo los parámetros de filtro/orden; "" si no hay ninguno. */
export function navQueryString(source: ParamSource): string {
  const params = new URLSearchParams();
  for (const key of NAV_PARAM_KEYS) {
    const value = source.get(key);
    if (value) params.set(key, value);
  }
  return params.toString();
}

export function leadHref(id: string, navQuery: string): string {
  return navQuery ? `/leads/${id}?${navQuery}` : `/leads/${id}`;
}
