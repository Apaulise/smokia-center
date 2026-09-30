// Sincronización con la API oficial de la plataforma (Instagram: Graph API de
// Meta) — la parte idempotente del flujo (Plans/03 §3.2). Se dispara desde tres
// lados: el botón "Sincronizar ahora", el chequeo al abrir /marca, y el cron.
// Las tres pisan el mismo día sin duplicar nada porque todo se escribe con
// upsert sobre la clave única de cada tabla (post_id+captured_on,
// account_id+captured_on, etc.).
//
// Usa el cliente admin siempre, sin importar quién la dispara: es pull (no hay
// webhook que autenticar), pero un cron no tiene sesión de usuario, así que
// necesita el mismo bypass de RLS que lib/apify/reconcile.ts — con el owner_id
// resuelto por quien llama y escrito explícito en cada fila (CLAUDE.md §4).
//
// Las credenciales son las del proveedor (variables de entorno, ver
// lib/meta/client.ts): la app es de un solo dueño y el token es de SU cuenta.
// Por eso el owner_id sólo decide dónde se escribe, no con qué cuenta se lee.
//
// Cuánto historial trae cada consulta lo decide el proveedor (ver
// INSIGHTS_WINDOW en lib/brand/sources/instagram.ts).
import { linkPublishedItems } from "@/lib/brand/planner/link";
import { getBrandSource } from "@/lib/brand/sources/registry";
import {
  hasAnyMetric,
  type BrandPlatform,
  type NormalizedAudienceRow,
  type NormalizedComment,
  type NormalizedPost,
} from "@/lib/brand/sources/types";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Una sincronización "en curso" que lleva más que esto se da por muerta (el
 * proceso se cortó a la mitad): la mayor duración de una corrida es el
 * `maxDuration` de 60 s, así que diez minutos sobran. Hay un índice único sobre
 * "una EN_CURSO por cuenta", y sin esta limpieza una muerta lo bloquearía para siempre.
 */
const STALE_RUNNING_MINUTES = 10;

/** Cada cuánto como mínimo se sincroniza sola al abrir /marca (Plans/03 §3.13). */
export const AUTO_SYNC_MIN_HOURS = 6;

export interface BrandSyncResult {
  status: Database["public"]["Enums"]["job_status"];
  itemsImported: number;
  error?: string;
  /**
   * Presente cuando NO se corrió: `EN_CURSO` si ya había otra sincronización de
   * esta cuenta andando, `RECIENTE` si la última terminó hace menos de lo pedido.
   * No es un error: es el guard funcionando.
   */
  skipped?: "EN_CURSO" | "RECIENTE";
}

export interface BrandSyncOptions {
  /** No sincronizar si la última completada terminó hace menos de estas horas. */
  skipIfCompletedWithinHours?: number;
}

export async function runBrandSync(
  ownerId: string,
  platform: BrandPlatform,
  options: BrandSyncOptions = {},
): Promise<BrandSyncResult> {
  const admin = createAdminClient();
  const provider = getBrandSource(platform);
  if (!provider) {
    return { status: "FALLIDO", itemsImported: 0, error: `Plataforma desconocida: ${platform}` };
  }

  if (!provider.isConfigured()) {
    return {
      status: "FALLIDO",
      itemsImported: 0,
      error: "Faltan las credenciales de Instagram (INSTAGRAM_ACCESS_TOKEN e INSTAGRAM_USER_ID).",
    };
  }

  const today = new Date().toISOString().slice(0, 10);

  // Los guards van pegados al insert del job: cuanto más lejos, más grande la ventana
  // en la que dos pestañas abiertas a la vez pasan las dos el chequeo.
  if (options.skipIfCompletedWithinHours !== undefined) {
    const since = new Date(Date.now() - options.skipIfCompletedWithinHours * 3_600_000).toISOString();
    const { data: recent } = await admin
      .from("brand_sync_jobs")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("platform", platform)
      .eq("status", "COMPLETADO")
      .gte("finished_at", since)
      .limit(1);
    if (recent && recent.length > 0) return { status: "COMPLETADO", itemsImported: 0, skipped: "RECIENTE" };
  }

  await admin
    .from("brand_sync_jobs")
    .update({ status: "FALLIDO", error: "Interrumpida: quedó en curso sin terminar.", finished_at: new Date().toISOString() })
    .eq("owner_id", ownerId)
    .eq("platform", platform)
    .eq("status", "EN_CURSO")
    .lt("started_at", new Date(Date.now() - STALE_RUNNING_MINUTES * 60_000).toISOString());

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

  // 23505 = el índice único "una EN_CURSO por cuenta": otra corrida (otra pestaña, o el cron) ya está andando.
  if (jobError?.code === "23505") return { status: "EN_CURSO", itemsImported: 0, skipped: "EN_CURSO" };
  if (jobError || !job) {
    return { status: "FALLIDO", itemsImported: 0, error: "No se pudo crear el job de sincronización." };
  }

  try {
    let itemsImported = 0;

    // 1a. Identidad + totales "a hoy" — una fila esperada por cuenta.
    const accounts = await provider.fetchAccounts();

    const accountIds = new Map<string, string>();
    let latestFollowers: number | null = null;

    for (const snapshot of accounts) {
      if (snapshot.followersCount !== null) latestFollowers = Math.max(latestFollowers ?? 0, snapshot.followersCount);

      // Si esta cuenta ya estaba guardada con otro id externo (venía de otra fuente de datos),
      // se la re-apunta en vez de crear una nueva: el historial cuelga del id interno.
      if (snapshot.username) {
        await admin
          .from("brand_accounts")
          .update({ external_id: snapshot.externalId })
          .eq("owner_id", ownerId)
          .eq("platform", platform)
          .eq("username", snapshot.username)
          .neq("external_id", snapshot.externalId);
      }

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

    // La meta de seguidores que ya se alcanzó pasa a CUMPLIDA (§3.13). Es un extra: no
    // puede tirar abajo una sincronización que ya trajo el contador.
    if (latestFollowers !== null) {
      await admin
        .from("brand_goals")
        .update({ status: "CUMPLIDA" })
        .eq("owner_id", ownerId)
        .eq("platform", platform)
        .eq("status", "ACTIVA")
        .lte("target_followers", latestFollowers);
    }

    // 1b. Métricas diarias — upsert por la fecha real de cada fila, no por "hoy".
    if (provider.fetchDailyMetrics && accountIds.size > 0) {
      for (const day of await provider.fetchDailyMetrics()) {
        const dayAccountId = accountIds.get(day.externalId);
        if (!dayAccountId) continue;

        await admin.from("brand_account_metrics").upsert(
          {
            owner_id: ownerId,
            account_id: dayAccountId,
            captured_on: day.date,
            reach: day.reach,
            impressions: day.impressions,
            profile_views: day.profileViews,
            new_followers: day.newFollowers,
            accounts_engaged: day.accountsEngaged,
            total_interactions: day.totalInteractions,
          },
          { onConflict: "account_id,captured_on" },
        );
      }
    }

    // Una cuenta por plataforma (la del token): el contenido y la audiencia son de esa cuenta.
    const accountId = accountIds.size === 1 ? [...accountIds.values()][0] : null;
    let posts: NormalizedPost[] = [];

    if (accountId) {
      posts = await provider.fetchMedia();
      itemsImported += await syncMedia({ admin, ownerId, accountId, posts, today });

      if (provider.capabilities.audience && provider.fetchAudience) {
        await syncAudience({ admin, ownerId, accountId, rows: await provider.fetchAudience(), today });
      }
    }

    if (provider.fetchComments && posts.length > 0) {
      itemsImported += await syncComments({ admin, ownerId, comments: await provider.fetchComments(posts) });
    }

    // Empalma lo publicado desde el planificador con su fila recién importada
    // (§3.7). Es un extra: si falla no puede tirar abajo una sincronización
    // que ya trajo todo lo demás, y la próxima corrida lo reintenta.
    try {
      await linkPublishedItems(admin, ownerId, platform);
    } catch {
      // se reintenta en la siguiente sincronización
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
  posts: NormalizedPost[];
  today: string;
}): Promise<number> {
  const { admin, ownerId, accountId, today } = params;

  // Un Map por external_id: un upsert con filas repetidas en el mismo statement
  // rompe con "ON CONFLICT DO UPDATE command cannot affect row a second time"
  // (mismo criterio que lib/apify/reconcile.ts).
  const posts = new Map<string, NormalizedPost>();
  for (const post of params.posts) posts.set(post.externalId, post);
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
    if (!postId || !hasAnyMetric(post)) return [];
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

async function syncComments(params: { admin: Admin; ownerId: string; comments: NormalizedComment[] }): Promise<number> {
  const { admin, ownerId, comments } = params;
  if (comments.length === 0) return 0;

  const postExternalIds = [...new Set(comments.map((c) => c.postExternalId))];
  const { data: posts } = await admin
    .from("brand_posts")
    .select("id, external_id")
    .eq("owner_id", ownerId)
    .in("external_id", postExternalIds);

  const postIdByExternalId = new Map((posts ?? []).map((p) => [p.external_id, p.id]));

  // Un Map por (post_id, external_id): un upsert con filas repetidas en el mismo
  // statement rompe (ver comentario en syncMedia).
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
  rows: NormalizedAudienceRow[];
  today: string;
}): Promise<void> {
  const { admin, ownerId, accountId, rows, today } = params;

  const inserts = rows.map((row) => ({
    owner_id: ownerId,
    account_id: accountId,
    captured_on: today,
    dimension: row.dimension,
    value: row.value,
    size: row.size,
  }));

  if (inserts.length > 0) {
    await admin.from("brand_audience").upsert(inserts, { onConflict: "account_id,captured_on,dimension,value" });
  }
}
