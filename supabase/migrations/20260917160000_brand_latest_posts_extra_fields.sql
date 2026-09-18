-- Biblioteca de contenido (Plans/03 §3.4): ordena también por guardados,
-- compartidos y seguidores ganados — brand_latest_posts no los traía.

drop function if exists public.brand_latest_posts(brand_platform, integer);

create function public.brand_latest_posts(p_platform brand_platform, p_limit integer default 8)
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
  saved integer,
  shares integer,
  new_followers integer,
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
    latest.saved,
    latest.shares,
    latest.new_followers,
    latest.reel_avg_watch_time_ms,
    latest.reel_skip_rate
  from public.brand_posts p
  join public.brand_accounts a on a.id = p.account_id and a.platform = p_platform
  left join lateral (
    select pm.reach, pm.views, pm.likes, pm.comments, pm.saved, pm.shares, pm.new_followers,
           pm.reel_avg_watch_time_ms, pm.reel_skip_rate
    from public.brand_post_metrics pm
    where pm.post_id = p.id
    order by pm.captured_on desc
    limit 1
  ) latest on true
  order by p.published_at desc nulls last
  limit least(greatest(p_limit, 1), 500);
$$;
