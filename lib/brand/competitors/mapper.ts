import type { BrandPostKind } from "@/lib/brand/sources/types";
import { asRecord, firstNumber, firstString } from "@/lib/brand/sources/utils";

/** Una publicación ajena normalizada, antes de mapearla a `brand_competitor_posts`. */
export interface NormalizedCompetitorPost {
  externalId: string;
  kind: BrandPostKind;
  permalink: string | null;
  caption: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  likes: number | null;
  comments: number | null;
  views: number | null;
  isPinned: boolean;
  /** Payload original del item, tal cual lo devolvió el actor. */
  raw: Record<string, unknown>;
}

/**
 * `productType: "clips"` es un reel; un video del feed viejo es `type: "Video"`.
 * Se acepta también la forma en minúsculas por si el actor cambia el casing.
 */
function mapKind(item: Record<string, unknown>): BrandPostKind | null {
  if (firstString(item, ["productType"])?.toLowerCase() === "clips") return "REEL";

  switch (firstString(item, ["type"])?.toLowerCase()) {
    case "video":
      return "VIDEO";
    case "sidecar":
      return "CARRUSEL";
    case "image":
      return "POST";
    default:
      return null;
  }
}

/** Apify devuelve -1 cuando la cuenta oculta los likes: no es un cero, es "no se sabe". */
function visibleCount(value: number | null): number | null {
  return value !== null && value >= 0 ? value : null;
}

/**
 * La foto de perfil del dueño de la publicación. El actor la devuelve en una
 * clave distinta según la versión y según si el item trae los datos del padre
 * (`addParentData`), así que se prueban todas las candidatas — y las mismas
 * dentro de los objetos anidados. Si no viene ninguna, la UI cae a un avatar
 * con la inicial: es una foto, no un dato del que dependa nada.
 */
const PROFILE_PIC_KEYS = ["ownerProfilePicUrl", "profilePicUrl", "profilePicUrlHD", "profile_pic_url"];

export function pickProfilePicUrl(raw: unknown): string | null {
  const item = asRecord(raw);
  if (!item) return null;

  const direct = firstString(item, PROFILE_PIC_KEYS);
  if (direct) return direct;

  for (const key of ["parentData", "owner", "user", "latestPosts"]) {
    const nested = asRecord(item[key]);
    const found = nested ? firstString(nested, PROFILE_PIC_KEYS) : null;
    if (found) return found;
  }
  return null;
}

/**
 * Un item del dataset de `apify/instagram-scraper` → una publicación
 * normalizada. Devolver null descarta el item (mismo contrato que `mapItem` de
 * los proveedores de Leads): sin id o sin formato reconocible no hay nada que
 * guardar. Un scraper devuelve lo que quiere y cambia sin avisar, así que la
 * lectura es defensiva y nunca lanza (CLAUDE.md §5).
 */
export function mapCompetitorPost(raw: unknown): NormalizedCompetitorPost | null {
  const item = asRecord(raw);
  if (!item) return null;

  const externalId = firstString(item, ["id", "shortCode"]);
  if (!externalId) return null;

  const kind = mapKind(item);
  if (!kind) return null;

  const shortCode = firstString(item, ["shortCode"]);

  return {
    externalId,
    kind,
    permalink: firstString(item, ["url"]) ?? (shortCode ? `https://www.instagram.com/p/${shortCode}/` : null),
    caption: firstString(item, ["caption"]),
    thumbnailUrl: firstString(item, ["displayUrl"]),
    publishedAt: firstString(item, ["timestamp"]),
    likes: visibleCount(firstNumber(item, ["likesCount"])),
    comments: visibleCount(firstNumber(item, ["commentsCount"])),
    // Los reels traen "plays" y "views": es la misma señal con dos nombres y cuál viene depende del actor.
    views: visibleCount(firstNumber(item, ["videoPlayCount", "videoViewCount"])),
    isPinned: item.isPinned === true,
    raw: item,
  };
}
