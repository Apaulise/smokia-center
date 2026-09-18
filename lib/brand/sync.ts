// Sincronización con Windsor.ai — la parte idempotente del flujo (Plans/03
// §3.2). Se dispara desde tres lados: el botón "Sincronizar ahora", el
// chequeo al abrir /marca, y el cron. Las tres pisan el mismo día sin
// duplicar nada porque todo se escribe con upsert sobre la clave única de
// cada tabla (post_id+captured_on, account_id+captured_on, etc.).
//
// Usa el cliente admin siempre, sin importar quién la dispara: a diferencia
// de Apify, Windsor es pull (no hay webhook que autenticar), pero un cron no
// tiene sesión de usuario, así que necesita el mismo bypass de RLS que
// lib/apify/reconcile.ts — con el owner_id resuelto por quien llama y escrito
// explícito en cada fila (CLAUDE.md §4).
//
// LÍMITE CONOCIDO: no se manda `select_accounts` a Windsor. Se probó contra
// una cuenta real y el `account_id` que devuelve el campo NO es el id que
// Windsor espera ahí (usa un id de "cuenta configurada" distinto, que no se
// expone por ningún field de lectura). Con una sola cuenta por plataforma —
// el caso de hoy — Windsor igual devuelve sólo lo suyo sin ese filtro. Si se
// conecta una segunda cuenta de la misma plataforma, esto hay que
// resolverlo primero (ver error `account_not_available` de Windsor, que sí
// lista el id correcto) o la sincronización va a mezclar cuentas.
//
// Sin date_from/date_to, Windsor devuelve sólo una ventana reciente angosta
// (probado: 1-2 posts en vez de los 7 reales de la cuenta). Por eso el
// contenido y la audiencia se piden con un rango amplio y fijo — no hay
// volumen para que traer todo de una sea un problema en esta escala.
const HISTORY_START = "2010-01-01";

import { getBrandSource } from "@/lib/brand/sources/registry";
import type {
  BrandAudienceDimension,
  BrandPlatform,
  NormalizedAudienceRow,
  NormalizedComment,
  NormalizedPost,
} from "@/lib/brand/sources/types";
import { asRecord, firstString } from "@/lib/brand/sources/utils";
import { decrypt } from "@/lib/crypto";
import { WINDSOR_KEY_SETTING } from "@/lib/settings/constants";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import { queryWindsorConnector } from "@/lib/windsor/client";

type Admin = ReturnType<typeof createAdminClient>;

export interface BrandSyncResult {
  status: Database["public"]["Enums"]["job_status"];
  itemsImported: number;
  error?: string;
}

function extractDate(raw: unknown, fallback: string): string {
  const row = asRecord(raw);
  if (!row) return fallback;
  return firstString(row, ["date"]) ?? fallback;
}

export async function runBrandSync(ownerId: string, platform: BrandPlatform): Promise<BrandSyncResult> {
  const admin = createAdminClient();
  const provider = getBrandSource(platform);
  if (!provider) {
    return { status: "FALLIDO", itemsImported: 0, error: `Plataforma desconocida: ${platform}` };
  }

  const { data: settingsRow } = await admin
    .from("settings")
    .select("value_encrypted")
    .eq("owner_id", ownerId)
    .eq("key", WINDSOR_KEY_SETTING)
    .maybeSingle();

  if (!settingsRow) {
    return { status: "FALLIDO", itemsImported: 0, error: "Falta la API key de Windsor." };
  }

  let apiKey: string;
  try {
    apiKey = decrypt(settingsRow.value_encrypted);
  } catch {
    return { status: "FALLIDO", itemsImported: 0, error: "La API key guardada no se pudo leer." };
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: job, error: jobError } = await admin
    .from("brand_sync_jobs")
    .insert({
      owner_id: ownerId,
      platform,
      status: "EN_CURSO",
      date_from: today,
      date_to: today,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobError || !job) {
    return { status: "FALLIDO", itemsImported: 0, error: "No se pudo crear el job de sincronización." };
  }

  try {
    let itemsImported = 0;

    // 1a. Identidad + totales "a hoy" — una fila esperada por cuenta.
    const identityRows = await queryWindsorConnector({
      apiKey,
      connector: provider.connector,
      fields: provider.accountFields,
    });

    const accountIds = new Map<string, string>();

    for (const raw of identityRows) {
      const snapshot = provider.mapAccount(raw);
      if (!snapshot) continue;

      const { data: account, error } = await admin
        .from("brand_accounts")
        .upsert(
          {
            owner_id: ownerId,
            platform,
            external_id: snapshot.externalId,
            username: snapshot.username,
            display_name: snapshot.displayName,
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: "owner_id,platform,external_id" },
        )
        .select("id")
        .single();

      if (error || !account) continue;
      accountIds.set(snapshot.externalId, account.id);
      itemsImported += 1;

      await admin.from("brand_account_metrics").upsert(
        {
          owner_id: ownerId,
          account_id: account.id,
          captured_on: today,
          followers_count: snapshot.followersCount,
          follows_count: snapshot.followsCount,
          media_count: snapshot.mediaCount,
        },
        { onConflict: "account_id,captured_on" },
      );
    }

    // 1b. Métricas diarias — consulta separada (ver comment del header),
    // upsert por la fecha real de cada fila, no por "hoy".
    if (provider.accountDailyFields && accountIds.size > 0) {
      const dailyRows = await queryWindsorConnector({
        apiKey,
        connector: provider.connector,
        fields: provider.accountDailyFields,
      });

      for (const raw of dailyRows) {
        const snapshot = provider.mapAccount(raw);
        if (!snapshot) continue;
        const accountId = accountIds.get(snapshot.externalId);
        if (!accountId) continue;

        await admin.from("brand_account_metrics").upsert(
          {
            owner_id: ownerId,
            account_id: accountId,
            captured_on: extractDate(raw, today),
            reach: snapshot.reach,
            impressions: snapshot.impressions,
            profile_views: snapshot.profileViews,
            new_followers: snapshot.newFollowers,
            accounts_engaged: snapshot.accountsEngaged,
            total_interactions: snapshot.totalInteractions,
          },
          { onConflict: "account_id,captured_on" },
        );
      }
    }

    for (const accountId of accountIds.values()) {
      itemsImported += await syncMedia({
        admin,
        ownerId,
        accountId,
        apiKey,
        connector: provider.connector,
        mediaFields: provider.mediaFields,
        mapMedia: provider.mapMedia,
        today,
      });

      if (provider.capabilities.audience && provider.audienceFields && provider.mapAudience) {
        await syncAudience({
          admin,
          ownerId,
          accountId,
          apiKey,
          connector: provider.connector,
          audienceFields: provider.audienceFields,
          mapAudience: provider.mapAudience,
          today,
        });
      }
    }

    if (provider.commentFields && provider.mapComment && accountIds.size > 0) {
      itemsImported += await syncComments({
        admin,
        ownerId,
        apiKey,
        connector: provider.connector,
        commentFields: provider.commentFields,
        mapComment: provider.mapComment,
        today,
      });
    }

    await admin
      .from("brand_sync_jobs")
      .update({ status: "COMPLETADO", items_imported: itemsImported, finished_at: new Date().toISOString() })
      .eq("id", job.id);

    return { status: "COMPLETADO", itemsImported };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error desconocido sincronizando.";
    await admin
      .from("brand_sync_jobs")
      .update({ status: "FALLIDO", error: message, finished_at: new Date().toISOString() })
      .eq("id", job.id);
    return { status: "FALLIDO", itemsImported: 0, error: message };
  }
}

async function syncMedia(params: {
  admin: Admin;
  ownerId: string;
  accountId: string;
  apiKey: string;
  connector: string;
  mediaFields: string[];
  mapMedia: (row: unknown) => NormalizedPost | null;
  today: string;
}): Promise<number> {
  const { admin, ownerId, accountId, apiKey, connector, mediaFields, mapMedia, today } = params;

  const mediaRows = await queryWindsorConnector({
    apiKey,
    connector,
    fields: mediaFields,
    dateFrom: HISTORY_START,
    dateTo: today,
  });

  // Un Map por external_id: si Windsor repite la misma pieza, un upsert con
  // filas repetidas en el mismo statement rompe con "ON CONFLICT DO UPDATE
  // command cannot affect row a second time" (mismo criterio que
  // lib/apify/reconcile.ts).
  const posts = new Map<string, NormalizedPost>();
  for (const raw of mediaRows) {
    const post = mapMedia(raw);
    if (post) posts.set(post.externalId, post);
  }
  if (posts.size === 0) return 0;

  const { data: savedPosts, error } = await admin
    .from("brand_posts")
    .upsert(
      [...posts.values()].map((post) => ({
        owner_id: ownerId,
        account_id: accountId,
        external_id: post.externalId,
        kind: post.kind,
        permalink: post.permalink,
        caption: post.caption,
        media_url: post.mediaUrl,
        thumbnail_url: post.thumbnailUrl,
        published_at: post.publishedAt,
        raw: post.raw as Json,
      })),
      { onConflict: "owner_id,account_id,external_id" },
    )
    .select("id, external_id");

  if (error || !savedPosts) return 0;

  const postIdByExternalId = new Map(savedPosts.map((p) => [p.external_id, p.id]));

  const metricsInserts = [...posts.values()].flatMap((post) => {
    const postId = postIdByExternalId.get(post.externalId);
    if (!postId) return [];
    return [
      {
        owner_id: ownerId,
        post_id: postId,
        captured_on: today,
        reach: post.reach,
        impressions: post.impressions,
        views: post.views,
        likes: post.likes,
        comments: post.comments,
        shares: post.shares,
        saved: post.saved,
        reel_total_watch_time_ms: post.reelTotalWatchTimeMs,
        reel_avg_watch_time_ms: post.reelAvgWatchTimeMs,
        reel_skip_rate: post.reelSkipRate,
        new_followers: post.newFollowers,
      },
    ];
  });

  if (metricsInserts.length > 0) {
    await admin.from("brand_post_metrics").upsert(metricsInserts, { onConflict: "post_id,captured_on" });
  }

  return savedPosts.length;
}

async function syncComments(params: {
  admin: Admin;
  ownerId: string;
  apiKey: string;
  connector: string;
  commentFields: string[];
  mapComment: (row: unknown) => NormalizedComment | null;
  today: string;
}): Promise<number> {
  const { admin, ownerId, apiKey, connector, commentFields, mapComment, today } = params;

  const rows = await queryWindsorConnector({
    apiKey,
    connector,
    fields: commentFields,
    dateFrom: HISTORY_START,
    dateTo: today,
  });

  const comments = rows.map(mapComment).filter((c): c is NormalizedComment => c !== null);
  if (comments.length === 0) return 0;

  const postExternalIds = [...new Set(comments.map((c) => c.postExternalId))];
  const { data: posts } = await admin
    .from("brand_posts")
    .select("id, external_id")
    .eq("owner_id", ownerId)
    .in("external_id", postExternalIds);

  const postIdByExternalId = new Map((posts ?? []).map((p) => [p.external_id, p.id]));

  // Un Map por (post_id, external_id): Windsor puede repetir el mismo
  // comment_id en el rango — probado contra la cuenta real — y un upsert con
  // filas repetidas en el mismo statement rompe (ver comentario en syncMedia).
  const dedup = new Map<string, (typeof comments)[number] & { postId: string }>();
  for (const comment of comments) {
    const postId = postIdByExternalId.get(comment.postExternalId);
    if (!postId) continue;
    dedup.set(`${postId}:${comment.externalId}`, { ...comment, postId });
  }
  if (dedup.size === 0) return 0;

  const { data: saved, error } = await admin
    .from("brand_post_comments")
    .upsert(
      [...dedup.values()].map((comment) => ({
        owner_id: ownerId,
        post_id: comment.postId,
        external_id: comment.externalId,
        username: comment.username,
        body: comment.body,
        like_count: comment.likeCount,
        commented_at: comment.commentedAt,
      })),
      { onConflict: "owner_id,post_id,external_id" },
    )
    .select("id");

  return error || !saved ? 0 : saved.length;
}

async function syncAudience(params: {
  admin: Admin;
  ownerId: string;
  accountId: string;
  apiKey: string;
  connector: string;
  audienceFields: Partial<Record<BrandAudienceDimension, [string, string]>>;
  mapAudience: (dimension: BrandAudienceDimension, row: unknown) => NormalizedAudienceRow | null;
  today: string;
}): Promise<void> {
  const { admin, ownerId, accountId, apiKey, connector, audienceFields, mapAudience, today } = params;

  // Las 4 dimensiones son consultas independientes entre sí — en paralelo en
  // vez de en serie, para no sumar 4 round-trips más a Windsor al tiempo
  // total de la corrida (importa en el límite de duración de la función).
  const dimensions = Object.keys(audienceFields) as BrandAudienceDimension[];
  const rowsByDimension = await Promise.all(
    dimensions.map((dimension) => {
      const fields = audienceFields[dimension];
      if (!fields) return Promise.resolve([]);
      return queryWindsorConnector({ apiKey, connector, fields, dateFrom: HISTORY_START, dateTo: today });
    }),
  );

  const inserts = dimensions.flatMap((dimension, i) =>
    rowsByDimension[i]
      .map((raw) => mapAudience(dimension, raw))
      .filter((row): row is NormalizedAudienceRow => row !== null)
      .map((row) => ({
        owner_id: ownerId,
        account_id: accountId,
        captured_on: today,
        dimension: row.dimension,
        value: row.value,
        size: row.size,
      })),
  );

  if (inserts.length > 0) {
    await admin.from("brand_audience").upsert(inserts, { onConflict: "account_id,captured_on,dimension,value" });
  }
}
