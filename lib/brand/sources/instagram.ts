import { listWindsorAccounts, runWindsorAction, WindsorActionError } from "@/lib/windsor/client";

import type { BrandAudienceDimension, BrandPostKind, BrandSourceProvider } from "./types";
import { asRecord, firstNumber, firstString } from "./utils";

const AUDIENCE_FIELDS: Partial<Record<BrandAudienceDimension, [name: string, size: string]>> = {
  EDAD: ["audience_age_name", "audience_age_size"],
  GENERO: ["audience_gender_name", "audience_gender_size"],
  // El campo "name" de esta dimensión es `city`, no `audience_city_name`
  // (Windsor no lo expone con ese prefijo — ver ficha de campos del conector).
  CIUDAD: ["city", "audience_city_size"],
  PAIS: ["audience_country_name", "audience_country_size"],
};

/**
 * Sólo cubre los tipos de `media_*` (feed): REEL, POST, CARRUSEL, VIDEO.
 * Las historias viven en un family de campos separado en Windsor
 * (`story_id`, `story_reach`, …) y no aparecen en esta consulta — se
 * sincronizan aparte cuando se implemente §3.2/§3.4.
 */
function mapMediaKind(row: Record<string, unknown>): BrandPostKind | null {
  switch (firstString(row, ["media_type"])) {
    // La ficha de campos de Windsor documenta "REEL", pero la cuenta real
    // devuelve "REELS" (plural) — se aceptan las dos formas.
    case "REEL":
    case "REELS":
      return "REEL";
    case "CAROUSEL_ALBUM":
      return "CARRUSEL";
    case "VIDEO":
      return "VIDEO";
    case "IMAGE":
      return "POST";
    default:
      return null;
  }
}

export const instagramProvider: BrandSourceProvider = {
  id: "INSTAGRAM",
  label: "Instagram",
  connector: "instagram",

  // Identidad + totales "a hoy". No puede ir junto con los campos _1d de
  // abajo: Windsor decompone la respuesta por día apenas ve uno de esos, y
  // los totales (que no son "de un día") vuelven null en esa forma (probado
  // contra la cuenta real — ver Plans/03 §3.2).
  accountFields: ["account_id", "username", "name", "biography", "website", "followers_count", "follows_count", "media_count"],

  // Métricas diarias. Windsor devuelve varias filas (una ventana reciente por
  // default, sin pedir date_from/date_to) — cada una con su propia fecha, así
  // que el motor de sync las guarda en el día que corresponde, no en "hoy".
  accountDailyFields: [
    "account_id",
    "date",
    "follower_count_1d",
    "reach_1d",
    "impressions_1d",
    "profile_views_1d",
    "accounts_engaged",
    "total_interactions",
  ],

  mediaFields: [
    "media_id",
    "media_type",
    "media_permalink",
    "media_caption",
    "media_url",
    "media_thumbnail_url",
    "timestamp",
    "media_reach",
    "media_impressions",
    "media_views",
    "media_like_count",
    "media_comments_count",
    "media_shares",
    "media_saved",
    "media_reel_total_watch_time",
    "media_reel_avg_watch_time",
    "media_reel_skip_rate",
    "media_follows",
  ],

  audienceFields: AUDIENCE_FIELDS,

  // media_id no está documentado en la ficha de campos de comentarios, pero
  // Windsor lo acepta igual y correlaciona bien (probado contra la cuenta real).
  commentFields: [
    "media_id",
    "comment_id",
    "comment_text",
    "comment_username",
    "comment_timestamp",
    "comment_like_count",
  ],

  capabilities: {
    audience: true,
    stories: true,
    // Confirmado contra GET /instagram/actions al llegar a §3.7: el conector
    // ofrece create_image_post, create_video_post, create_story y
    // create_carousel_post. Instagram publica todo video simple como Reel, así
    // que REEL y VIDEO comparten acción.
    publish: ["REEL", "VIDEO", "POST", "CARRUSEL", "HISTORIA"],
  },

  async publish({ apiKey, accountUsername, kind, caption, media }) {
    const accounts = await listWindsorAccounts(apiKey, "instagram");
    // El id que Windsor espera acá no es el `external_id` de brand_accounts
    // (ver listWindsorAccounts): se resuelve por username, o por la única
    // cuenta conectada.
    const account =
      accounts.find((a) => a.name && accountUsername && a.name.toLowerCase() === accountUsername.toLowerCase()) ??
      (accounts.length === 1 ? accounts[0] : null);
    if (!account) {
      throw new WindsorActionError(
        accounts.length === 0
          ? "Windsor no tiene ninguna cuenta de Instagram conectada."
          : "No se pudo saber a qué cuenta de Instagram publicar: hay varias conectadas en Windsor.",
        true,
      );
    }

    const first = media[0];
    if (!first) throw new WindsorActionError("La pieza no tiene archivos para publicar.", true);

    let action: string;
    let params: Record<string, unknown>;
    switch (kind) {
      case "REEL":
      case "VIDEO":
        action = "create_video_post";
        params = { video_url: first.url, caption };
        break;
      case "POST":
        action = "create_image_post";
        params = { image_url: first.url, caption };
        break;
      case "CARRUSEL":
        action = "create_carousel_post";
        params = { image_urls: media.map((m) => m.url), caption };
        break;
      case "HISTORIA":
        // Las historias no llevan caption (lo dice el conector).
        action = "create_story";
        params = first.type === "VIDEO" ? { video_url: first.url } : { image_url: first.url };
        break;
      default:
        throw new WindsorActionError(`Instagram no publica piezas de tipo ${kind}.`, true);
    }

    return runWindsorAction({ apiKey, connector: "instagram", account: account.id, action, params });
  },

  mapAccount(raw) {
    const row = asRecord(raw);
    if (!row) return null;

    const externalId = firstString(row, ["account_id"]);
    if (!externalId) return null;

    return {
      externalId,
      username: firstString(row, ["username"]),
      displayName: firstString(row, ["name"]),
      biography: firstString(row, ["biography"]),
      website: firstString(row, ["website"]),
      followersCount: firstNumber(row, ["followers_count"]),
      followsCount: firstNumber(row, ["follows_count"]),
      mediaCount: firstNumber(row, ["media_count"]),
      reach: firstNumber(row, ["reach_1d"]),
      impressions: firstNumber(row, ["impressions_1d"]),
      profileViews: firstNumber(row, ["profile_views_1d"]),
      newFollowers: firstNumber(row, ["follower_count_1d"]),
      accountsEngaged: firstNumber(row, ["accounts_engaged"]),
      totalInteractions: firstNumber(row, ["total_interactions"]),
      raw: row,
    };
  },

  mapMedia(raw) {
    const row = asRecord(raw);
    if (!row) return null;

    const externalId = firstString(row, ["media_id"]);
    if (!externalId) return null;

    const kind = mapMediaKind(row);
    if (!kind) return null;

    return {
      externalId,
      kind,
      permalink: firstString(row, ["media_permalink"]),
      caption: firstString(row, ["media_caption"]),
      mediaUrl: firstString(row, ["media_url"]),
      thumbnailUrl: firstString(row, ["media_thumbnail_url"]),
      publishedAt: firstString(row, ["timestamp"]),
      reach: firstNumber(row, ["media_reach"]),
      impressions: firstNumber(row, ["media_impressions"]),
      views: firstNumber(row, ["media_views"]),
      likes: firstNumber(row, ["media_like_count"]),
      comments: firstNumber(row, ["media_comments_count"]),
      shares: firstNumber(row, ["media_shares"]),
      saved: firstNumber(row, ["media_saved"]),
      reelTotalWatchTimeMs: firstNumber(row, ["media_reel_total_watch_time"]),
      reelAvgWatchTimeMs: firstNumber(row, ["media_reel_avg_watch_time"]),
      reelSkipRate: firstNumber(row, ["media_reel_skip_rate"]),
      newFollowers: firstNumber(row, ["media_follows"]),
      raw: row,
    };
  },

  mapComment(raw) {
    const row = asRecord(raw);
    if (!row) return null;

    const postExternalId = firstString(row, ["media_id"]);
    const externalId = firstString(row, ["comment_id"]);
    if (!postExternalId || !externalId) return null;

    return {
      postExternalId,
      externalId,
      username: firstString(row, ["comment_username"]),
      body: firstString(row, ["comment_text"]),
      likeCount: firstNumber(row, ["comment_like_count"]),
      commentedAt: firstString(row, ["comment_timestamp"]),
    };
  },

  mapAudience(dimension, raw) {
    const row = asRecord(raw);
    if (!row) return null;

    const fields = AUDIENCE_FIELDS[dimension];
    if (!fields) return null;
    const [nameField, sizeField] = fields;

    const value = firstString(row, [nameField]);
    const size = firstNumber(row, [sizeField]);
    if (!value || size === null) return null;

    return { dimension, value, size };
  },
};
