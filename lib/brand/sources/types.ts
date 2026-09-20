/** Espeja el enum Postgres `brand_platform` que trae la migración de §3.2. */
export type BrandPlatform = "INSTAGRAM" | "YOUTUBE";

/** Espeja el enum Postgres `brand_post_kind` que trae la migración de §3.2. */
export type BrandPostKind = "REEL" | "POST" | "CARRUSEL" | "HISTORIA" | "VIDEO" | "SHORT";

/** Espeja el enum Postgres `brand_audience_dimension` que trae la migración de §3.2. */
export type BrandAudienceDimension = "EDAD" | "GENERO" | "CIUDAD" | "PAIS";

/** Snapshot normalizado de una cuenta, antes de mapearlo a `brand_accounts` / `brand_account_metrics`. */
export interface NormalizedAccountSnapshot {
  externalId: string;
  username: string | null;
  displayName: string | null;
  biography: string | null;
  website: string | null;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
  reach: number | null;
  impressions: number | null;
  profileViews: number | null;
  newFollowers: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
  /** Payload original de la fila, tal cual la devolvió el conector. */
  raw: unknown;
}

/** Pieza de contenido normalizada, antes de mapearla a `brand_posts` / `brand_post_metrics`. */
export interface NormalizedPost {
  externalId: string;
  kind: BrandPostKind;
  permalink: string | null;
  caption: string | null;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  reach: number | null;
  impressions: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  reelTotalWatchTimeMs: number | null;
  reelAvgWatchTimeMs: number | null;
  reelSkipRate: number | null;
  newFollowers: number | null;
  /** Payload original de la fila, tal cual la devolvió el conector. */
  raw: unknown;
}

/** Una fila de demografía normalizada, antes de mapearla a `brand_audience`. */
export interface NormalizedAudienceRow {
  dimension: BrandAudienceDimension;
  value: string;
  size: number;
}

/** Un comentario normalizado, antes de mapearlo a `brand_post_comments`. */
export interface NormalizedComment {
  /** external_id de la pieza a la que pertenece — el motor de sync lo resuelve al post_id interno. */
  postExternalId: string;
  externalId: string;
  /**
   * Null salvo cuando el autor es el dueño de la cuenta respondiendo su
   * propio post — restricción de privacidad de Meta, no un vacío de mapeo.
   */
  username: string | null;
  body: string | null;
  likeCount: number | null;
  commentedAt: string | null;
}

/** Un archivo a publicar: la URL pública del bucket `brand-media` y si es imagen o video. */
export interface PublishMedia {
  /** Instagram la busca desde sus propios servidores (ver §3.7): tiene que ser pública. */
  url: string;
  type: "IMAGE" | "VIDEO";
}

export interface PublishParams {
  apiKey: string;
  /** Username de la cuenta (`brand_accounts.username`): con eso se resuelve la cuenta en Windsor. */
  accountUsername: string | null;
  kind: BrandPostKind;
  caption: string | null;
  /** Uno para reel/post/historia; de 2 a 10 para un carrusel. */
  media: PublishMedia[];
}

export interface PublishResult {
  /** El id de la pieza en la plataforma. Null si el conector no lo devolvió — la sincronización la empalma después. */
  externalId: string | null;
  /** Lo que respondió el conector, para mostrarlo tal cual. */
  message: string | null;
}

/**
 * Una fuente de métricas de marca corrida contra Windsor.ai.
 *
 * Igual que `LeadSourceProvider` en lib/providers/types.ts: sumar una
 * plataforma es un archivo nuevo + una línea en el registro, nunca una
 * pantalla editada (ver CLAUDE.md §9 y Plans/03 §3.1).
 */
export interface BrandSourceProvider {
  id: BrandPlatform;
  label: string;
  /** Slug del conector en Windsor, ej. "instagram". */
  connector: string;
  /** Field ids de Windsor para el snapshot de cuenta (`fields=` de la consulta de lectura). */
  accountFields: string[];
  /**
   * Field ids "por día" del snapshot de cuenta (ej. `follower_count_1d`).
   * Se consultan aparte de `accountFields`: mezclarlos con los totales hace
   * que Windsor decomponga la respuesta por día y los totales vuelvan null.
   * Windsor devuelve una fila por día de una ventana reciente por default.
   */
  accountDailyFields?: string[];
  /** Field ids de Windsor para cada pieza de contenido. */
  mediaFields: string[];
  /**
   * Un `[name, size]` de campos de Windsor por dimensión de audiencia (ver
   * `capabilities.audience`). Se consulta una dimensión por vez: Windsor
   * devuelve una fila por bucket (ej. un rango etario), y mezclar dos
   * dimensiones en la misma consulta produciría un cruce ambiguo.
   */
  audienceFields?: Partial<Record<BrandAudienceDimension, [string, string]>>;
  /** Field ids de Windsor para comentarios (debe incluir el id de la pieza — ver Plans/03 §3.4). */
  commentFields?: string[];
  capabilities: {
    audience: boolean;
    stories: boolean;
    publish: BrandPostKind[];
  };
  mapAccount(row: unknown): NormalizedAccountSnapshot | null;
  mapMedia(row: unknown): NormalizedPost | null;
  /** `row` ya viene escopeado a una sola dimensión (ver `audienceFields`). */
  mapAudience?(dimension: BrandAudienceDimension, row: unknown): NormalizedAudienceRow | null;
  mapComment?(row: unknown): NormalizedComment | null;
  publish?(params: PublishParams): Promise<PublishResult>;
}
