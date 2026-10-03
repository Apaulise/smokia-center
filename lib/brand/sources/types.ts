import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";

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
}

/** Las métricas "de un día" de una cuenta, antes de mapearlas a `brand_account_metrics`. */
export interface NormalizedDailyMetrics {
  externalId: string;
  /** YYYY-MM-DD del día al que corresponden (no "hoy"). */
  date: string;
  reach: number | null;
  impressions: number | null;
  profileViews: number | null;
  newFollowers: number | null;
  accountsEngaged: number | null;
  totalInteractions: number | null;
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
  /** Payload original, tal cual lo devolvió la API. */
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
  kind: BrandPostKind;
  caption: string | null;
  /** Uno para reel/post/historia; de 2 a 10 para un carrusel. */
  media: PublishMedia[];
}

export interface PublishResult {
  /** El id de la pieza en la plataforma. Null si la plataforma no lo devolvió — la sincronización la empalma después. */
  externalId: string | null;
  /** Lo que respondió la plataforma, para mostrarlo tal cual. */
  message: string | null;
}

/**
 * Una fuente de métricas de marca, hablada contra la API oficial de la
 * plataforma (Instagram: Graph API de Meta — lib/meta/client.ts).
 *
 * Igual que `LeadSourceProvider` en lib/providers/types.ts: sumar una
 * plataforma es un archivo nuevo + una línea en el registro, nunca una
 * pantalla editada (ver CLAUDE.md §9 y Plans/03 §3.1). Cada plataforma resuelve
 * sus credenciales y su paginación adentro; el motor de sync sólo ve filas ya
 * normalizadas.
 *
 * Las credenciales son de cada usuario (Plans/acceso-multiusuario.md), así que
 * el provider no habla con la plataforma directamente: `connect` devuelve una
 * conexión atada a las credenciales de ESE owner.
 */
export interface BrandSourceProvider {
  id: BrandPlatform;
  label: string;
  capabilities: {
    audience: boolean;
    stories: boolean;
    publish: BrandPostKind[];
  };
  /**
   * Conexión con las credenciales de `ownerId`, o null si ese usuario no
   * conectó la plataforma (no dice si el token sigue vigente). Con el cliente
   * admin, filtra por owner_id explícitamente.
   */
  connect(supabase: SupabaseClient<Database>, ownerId: string): Promise<BrandSourceConnection | null>;
}

/** Lo que se le puede pedir a una plataforma ya conectada con las credenciales de un usuario. */
export interface BrandSourceConnection {
  /** Identidad + totales "a hoy" de cada cuenta. */
  fetchAccounts(): Promise<NormalizedAccountSnapshot[]>;
  /** Métricas por día de una ventana reciente, una fila por cuenta y día. */
  fetchDailyMetrics?(): Promise<NormalizedDailyMetrics[]>;
  /**
   * Las piezas de contenido con sus métricas. Una pieza fuera de la ventana en
   * la que se piden métricas vuelve con TODAS en null, y el motor de sync no le
   * escribe fila de métricas de hoy (ver `hasAnyMetric`).
   */
  fetchMedia(): Promise<NormalizedPost[]>;
  /** Todas las dimensiones de audiencia de la cuenta. Vacío si la plataforma no las da (ej. menos de 100 seguidores). */
  fetchAudience?(): Promise<NormalizedAudienceRow[]>;
  /** Comentarios de las piezas dadas. */
  fetchComments?(posts: NormalizedPost[]): Promise<NormalizedComment[]>;
  publish?(params: PublishParams): Promise<PublishResult>;
}

/** Una pieza sin ninguna métrica no debe escribir una fila de "hoy": pisaría con nulls la última foto buena. */
export function hasAnyMetric(post: NormalizedPost): boolean {
  return [
    post.reach,
    post.impressions,
    post.views,
    post.likes,
    post.comments,
    post.shares,
    post.saved,
    post.reelTotalWatchTimeMs,
    post.reelAvgWatchTimeMs,
    post.reelSkipRate,
    post.newFollowers,
  ].some((value) => value !== null);
}
