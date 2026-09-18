-- ═══════════════════════════════════════════════════════════════════════════
-- Dashboard del Gestor de Marca Personal (Plans/03 §3.3)
--
-- Mismo criterio que 20260914120000_leads_dashboard_functions.sql: los
-- agregados se resuelven acá, no trayendo filas al servidor para sumarlas
-- (CLAUDE.md §5). SECURITY INVOKER (default): corren con el rol del usuario
-- logueado, así que RLS filtra igual que en cualquier query.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Identidad + variación de seguidores ────────────────────────────────────
-- La variación se mide contra el snapshot más viejo disponible en la ventana,
-- no necesariamente "hace 30 días": recién sincronizado, sólo va a haber
-- unos pocos días — oldest_snapshot_on le permite a la UI decirlo en vez de
-- fingir una comparación de 30 días que no existe todavía.

create or replace function public.brand_account_summary(p_platform brand_platform, days integer default 30)
returns table (
  account_id uuid,
  username text,
  display_name text,
  followers_count integer,
  follows_count integer,
  media_count integer,
  followers_at_oldest integer,
  oldest_snapshot_on date
)
language sql
stable
as $$
  with account as (
    select id, username, display_name
    from public.brand_accounts
    where platform = p_platform
    order by created_at
    limit 1
  ),
  window_metrics as (
    select m.*
    from public.brand_account_metrics m
    join account a on a.id = m.account_id
    where m.captured_on >= current_date - (least(greatest(days, 1), 90) - 1)
  ),
  latest_totals as (
    select followers_count, follows_count, media_count
    from window_metrics
    where followers_count is not null
    order by captured_on desc
    limit 1
  ),
  oldest_followers as (
    select followers_count, captured_on
    from window_metrics
    where followers_count is not null
    order by captured_on asc
    limit 1
  )
  select
    a.id,
    a.username,
    a.display_name,
    lt.followers_count,
    lt.follows_count,
    lt.media_count,
    ofc.followers_count,
    ofc.captured_on
  from account a
  left join latest_totals lt on true
  left join oldest_followers ofc on true;
$$;

-- ── Curva de seguidores + alcance/interacciones por día ────────────────────
-- Un solo generate_series para las tres series: comparten eje X y evitan
-- tres round-trips separados por el mismo rango de días.

create or replace function public.brand_metrics_timeline(p_platform brand_platform, days integer default 30)
returns table (
  day date,
  followers_count integer,
  reach bigint,
  total_interactions bigint
)
language sql
stable
as $$
  select
    d::date as day,
    m.followers_count,
    m.reach,
    m.total_interactions
  from generate_series(
    current_date - (least(greatest(days, 7), 90) - 1),
    current_date,
    interval '1 day'
  ) as d
  left join public.brand_account_metrics m
    on m.captured_on = d::date
    and m.account_id = (
      select id from public.brand_accounts where platform = p_platform order by created_at limit 1
    )
  order by d;
$$;

-- ── Audiencia — última foto disponible, no serie histórica ─────────────────

create or replace function public.brand_audience_summary(p_platform brand_platform)
returns table (
  dimension brand_audience_dimension,
  value text,
  size integer
)
language sql
stable
as $$
  with account as (
    select id from public.brand_accounts where platform = p_platform order by created_at limit 1
  ),
  latest_day as (
    select max(captured_on) as captured_on
    from public.brand_audience a
    join account acc on acc.id = a.account_id
  )
  select a.dimension, a.value, a.size
  from public.brand_audience a
  join account acc on acc.id = a.account_id
  join latest_day ld on a.captured_on = ld.captured_on
  order by a.dimension, a.size desc;
$$;

-- ── Últimas piezas de contenido, con su métrica más reciente ───────────────
-- "Últimos reels" del wireframe: en la práctica, últimas piezas de cualquier
-- tipo — filtrar por REEL queda en la UI si hace falta.

create or replace function public.brand_latest_posts(p_platform brand_platform, p_limit integer default 8)
returns table (
  post_id uuid,
  kind brand_post_kind,
  permalink text,
  caption text,
  thumbnail_url text,
  published_at timestamptz,
  reach integer,
  views integer,
  likes integer,
  comments integer,
  reel_avg_watch_time_ms integer,
  reel_skip_rate numeric
)
language sql
stable
as $$
  select
    p.id,
    p.kind,
    p.permalink,
    p.caption,
    p.thumbnail_url,
    p.published_at,
    latest.reach,
    latest.views,
    latest.likes,
    latest.comments,
    latest.reel_avg_watch_time_ms,
    latest.reel_skip_rate
  from public.brand_posts p
  join public.brand_accounts a on a.id = p.account_id and a.platform = p_platform
  left join lateral (
    select pm.reach, pm.views, pm.likes, pm.comments, pm.reel_avg_watch_time_ms, pm.reel_skip_rate
    from public.brand_post_metrics pm
    where pm.post_id = p.id
    order by pm.captured_on desc
    limit 1
  ) latest on true
  order by p.published_at desc nulls last
  limit least(greatest(p_limit, 1), 50);
$$;

-- ── Views totales de contenido — KPI de la franja superior ─────────────────
-- No hay "views por día" a nivel cuenta (Windsor no lo expone para esta
-- cuenta); se suma la métrica más reciente de cada post en su lugar.

create or replace function public.brand_content_views_total(p_platform brand_platform)
returns bigint
language sql
stable
as $$
  select coalesce(sum(latest.views), 0)
  from public.brand_posts p
  join public.brand_accounts a on a.id = p.account_id and a.platform = p_platform
  left join lateral (
    select pm.views
    from public.brand_post_metrics pm
    where pm.post_id = p.id
    order by pm.captured_on desc
    limit 1
  ) latest on true;
$$;
