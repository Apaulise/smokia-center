import type { AnalysisPost } from "./types";

/**
 * (likes+comments+shares+saved) / alcance — o views si no hay alcance
 * (Historias e Instagram viejo no siempre exponen reach). null cuando no hay
 * base para dividir: esos posts quedan afuera de todo ranking en vez de
 * entrar con una tasa inventada.
 */
export function engagementRate(post: AnalysisPost): number | null {
  const base = post.reach ?? post.views;
  if (!base || base <= 0) return null;
  const interactions = (post.likes ?? 0) + (post.comments ?? 0) + (post.shares ?? 0) + (post.saved ?? 0);
  return interactions / base;
}
