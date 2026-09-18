import { instagramProvider } from "./instagram";
import type { BrandPlatform, BrandSourceProvider } from "./types";

/**
 * Fuentes de métricas de marca, en orden de aparición como tab (ver
 * CLAUDE.md §9, mismo criterio que lib/providers/registry.ts). Sumar una
 * plataforma = un archivo acá + una línea abajo. YouTube (§3.9) todavía no
 * tiene archivo: se agrega cuando se decida encenderlo.
 */
export const BRAND_SOURCES: BrandSourceProvider[] = [instagramProvider];

const REGISTRY = new Map<BrandPlatform, BrandSourceProvider>(BRAND_SOURCES.map((provider) => [provider.id, provider]));

export function getBrandSource(platform: BrandPlatform): BrandSourceProvider | null {
  return REGISTRY.get(platform) ?? null;
}

export type {
  BrandPlatform,
  BrandPostKind,
  BrandSourceProvider,
  NormalizedAccountSnapshot,
  NormalizedPost,
  PublishParams,
} from "./types";
