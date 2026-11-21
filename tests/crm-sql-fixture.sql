-- Esquema mínimo para ejecutar la migración CRM en un PostgreSQL descartable.
create schema auth;
create role anon;
create role authenticated;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant usage on schema auth, public to authenticated;

create table public.leads(id uuid primary key, owner_id uuid not null, status text not null);
create table public.teams(id uuid primary key);
create table public.team_members(owner_id uuid primary key, team_id uuid not null);
create table public.conversations(id uuid primary key, owner_id uuid not null, team_id uuid);
grant select on public.leads, public.team_members, public.conversations to authenticated;
alter table public.leads enable row level security;
alter table public.team_members enable row level security;
alter table public.conversations enable row level security;
create policy read_leads on public.leads for select to authenticated using (owner_id = auth.uid());
create policy read_member on public.team_members for select to authenticated using (owner_id = auth.uid());
create policy read_conversations on public.conversations for select to authenticated using (
  owner_id = auth.uid() or team_id = (select team_id from public.team_members where owner_id = auth.uid())
);

create function public.team_can_see(p_owner uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.team_members me join public.team_members them on them.team_id = me.team_id
    where me.owner_id = (select auth.uid()) and them.owner_id = p_owner
  );
$$;
revoke all on function public.team_can_see(uuid) from public, anon, authenticated;

insert into auth.users values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000003');
insert into public.teams values
  ('00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000012');
insert into public.team_members values
  ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000012');
insert into public.leads values
  ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000001','CERRADO_GANADO'),
  ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000001','INTERESADO');
insert into public.conversations values
  ('00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000011'),
  ('00000000-0000-4000-8000-000000000032','00000000-0000-4000-8000-000000000001',null);
