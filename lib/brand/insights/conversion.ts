/**
 * STUB — la conversión no se mide en la Fase 3 (Plans/03 §3.11).
 *
 * Leads, llamadas y clientes son del Gestor de Facturación (Fase 2, CLAUDE.md
 * §2), que no arrancó. Hasta entonces `GANADOR_CONVERSION` es un valor del tipo
 * `ResultClass` que `classifyPosts` nunca produce: deducirlo de proxies
 * (comentarios que "parecen" un CTA) sería ruido con cara de dato.
 *
 * Cuando exista la Fase 2, esta función cruza la pieza con los leads que
 * atribuye a ella y `classifyPosts` la consulta.
 */
export interface ConversionSignal {
  leads: number;
  calls: number;
}

export async function getConversionSignal(postId: string): Promise<ConversionSignal | null> {
  void postId;
  return null;
}
