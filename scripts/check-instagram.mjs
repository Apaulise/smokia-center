// Diagnóstico de la conexión con la Graph API de Instagram. Uso:
//   node --env-file=.env.local scripts/check-instagram.mjs
// Prueba cada consulta que hace la sincronización y publicación y dice cuál anda
// y cuál no. Nunca imprime el token: sólo nombres de campos, cantidades y errores de Meta.

const VERSION = "v23.0";
const token = process.env.INSTAGRAM_ACCESS_TOKEN?.trim();
const userId = process.env.INSTAGRAM_USER_ID?.trim();

if (!token || !userId) {
  console.error("Faltan INSTAGRAM_ACCESS_TOKEN o INSTAGRAM_USER_ID en .env.local");
  process.exit(1);
}

const base = token.startsWith("IG") ? "https://graph.instagram.com" : "https://graph.facebook.com";
console.log(`Host: ${base} (token ${token.startsWith("IG") ? "Instagram Login" : "Facebook Login"}), versión ${VERSION}\n`);

async function get(label, path, params = {}) {
  const query = new URLSearchParams({ access_token: token, ...params });
  try {
    const response = await fetch(`${base}/${VERSION}/${path}?${query}`);
    const body = await response.json();
    if (!response.ok) {
      console.log(`✗ ${label}: ${body?.error?.message ?? response.status} (code ${body?.error?.code ?? "?"})`);
      return null;
    }
    return body;
  } catch (error) {
    console.log(`✗ ${label}: ${error.message}`);
    return null;
  }
}

const account = await get("cuenta", userId, {
  fields: "id,username,name,followers_count,follows_count,media_count",
});
if (account) {
  console.log(`✓ cuenta: @${account.username} · ${account.followers_count} seguidores · ${account.media_count} piezas · id ${account.id}`);
}

// Conteo de TODAS las piezas que lista /media (con paginación), para compararlo con la biblioteca.
{
  let total = 0;
  const byType = {};
  let after;
  do {
    const page = await get("conteo de piezas", `${userId}/media`, {
      fields: "id,media_type,media_product_type",
      limit: 50,
      ...(after ? { after } : {}),
    });
    if (!page) break;
    for (const item of page.data ?? []) {
      total += 1;
      const key = `${item.media_product_type}/${item.media_type}`;
      byType[key] = (byType[key] ?? 0) + 1;
    }
    after = page.paging?.next ? page.paging.cursors?.after : undefined;
  } while (after);
  console.log(`✓ /media lista ${total} piezas en total: ${JSON.stringify(byType)}\n`);
}

const day = Math.floor(Date.now() / 86_400_000) * 86_400;
const daily = await get("métricas diarias", `${userId}/insights`, {
  metric: "reach,views,profile_views,accounts_engaged,total_interactions",
  metric_type: "total_value",
  period: "day",
  since: day - 86_400,
  until: day,
});
if (daily) console.log(`✓ métricas diarias: ${(daily.data ?? []).map((m) => `${m.name}=${m.total_value?.value}`).join(", ")}`);

const followers = await get("nuevos seguidores", `${userId}/insights`, {
  metric: "follower_count",
  period: "day",
  since: day - 6 * 86_400,
  until: day + 86_400,
});
if (followers) console.log(`✓ nuevos seguidores: ${followers.data?.[0]?.values?.length ?? 0} días`);

const media = await get("piezas", `${userId}/media`, {
  fields: "id,media_type,media_product_type,timestamp,like_count,comments_count",
  limit: 5,
});
if (media) {
  console.log(`✓ piezas: ${media.data?.length ?? 0} (las 5 más nuevas)`);
  for (const item of media.data ?? []) {
    const isReel = item.media_product_type === "REELS";
    const metric = isReel
      ? "reach,views,saved,shares,likes,comments,ig_reels_avg_watch_time,ig_reels_video_view_total_time"
      : "reach,views,saved,shares,likes,comments,follows";
    const insights = await get(`insights ${item.media_product_type}/${item.media_type} ${item.id}`, `${item.id}/insights`, { metric });
    if (insights) console.log(`  ✓ ${item.media_product_type}/${item.media_type}: ${(insights.data ?? []).map((m) => `${m.name}=${m.values?.[0]?.value}`).join(", ")}`);
  }
  const withComments = (media.data ?? []).filter((item) => item.comments_count > 0);
  if (withComments.length === 0) console.log("- comentarios: ninguna de las 5 piezas tiene comentarios, sin probar");
  for (const item of withComments) {
    const comments = await get(`comentarios ${item.id}`, `${item.id}/comments`, { fields: "id,text,username,timestamp,like_count", limit: 50 });
    if (comments) {
      console.log(`  comentarios ${item.id}: la pieza dice tener ${item.comments_count}, la API devolvió ${comments.data?.length ?? 0} (username ${comments.data?.[0]?.username ? "presente" : "ausente"})`);
    }
  }

  const scopes = await get("permisos del token", "me/permissions");
  if (scopes) console.log(`permisos: ${(scopes.data ?? []).map((p) => `${p.permission}:${p.status}`).join(", ")}`);
}

for (const breakdown of ["age", "gender", "city", "country"]) {
  const audience = await get(`audiencia ${breakdown}`, `${userId}/insights`, {
    metric: "follower_demographics",
    period: "lifetime",
    metric_type: "total_value",
    breakdown,
  });
  if (audience) {
    const results = audience.data?.[0]?.total_value?.breakdowns?.[0]?.results ?? [];
    console.log(`✓ audiencia ${breakdown}: ${results.length} filas${results[0] ? ` (ej. ${results[0].dimension_values?.[0]} = ${results[0].value})` : ""}`);
  }
}
