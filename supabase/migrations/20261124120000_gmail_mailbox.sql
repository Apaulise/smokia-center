create unique index gmail_team_members_identity_idx on public.team_members(id, owner_id, team_id);

create table public.gmail_mailboxes (
  team_id uuid primary key references public.teams(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  membership_id uuid not null,
  connection_id uuid not null default gen_random_uuid(),
  email text not null,
  refresh_token_encrypted text not null,
  shared boolean not null default false,
  foreign key (membership_id, owner_id, team_id) references public.team_members(id, owner_id, team_id) on delete cascade
);
create index gmail_mailboxes_owner_idx on public.gmail_mailboxes(owner_id);
create index gmail_mailboxes_membership_idx on public.gmail_mailboxes(membership_id);

create table public.gmail_oauth_attempts (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null,
  verifier_encrypted text not null,
  membership_id uuid not null references public.team_members(id) on delete cascade,
  session_id uuid not null,
  expires_at timestamptz not null
);
create index gmail_oauth_attempts_membership_idx on public.gmail_oauth_attempts(membership_id);

alter table public.gmail_mailboxes enable row level security;
alter table public.gmail_oauth_attempts enable row level security;

revoke all on public.gmail_mailboxes, public.gmail_oauth_attempts from public, anon, authenticated;
grant select, insert, delete on public.gmail_mailboxes to authenticated;
grant update (connection_id, email, refresh_token_encrypted, shared) on public.gmail_mailboxes to authenticated;
grant select, insert, update, delete on public.gmail_oauth_attempts to authenticated;

create policy gmail_mailbox_read on public.gmail_mailboxes for select to authenticated
  using (
    team_id = (select team_id from public.team_members where owner_id = (select auth.uid()))
    and (shared or owner_id = (select auth.uid()))
  );
create policy gmail_mailbox_connect on public.gmail_mailboxes for insert to authenticated
  with check (
    owner_id = (select auth.uid()) and not shared
    and exists (
      select 1 from public.team_members m
      where m.id = gmail_mailboxes.membership_id and m.owner_id = gmail_mailboxes.owner_id
        and m.team_id = gmail_mailboxes.team_id
    )
  );
create policy gmail_mailbox_update on public.gmail_mailboxes for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.team_members m
      where m.id = gmail_mailboxes.membership_id and m.owner_id = gmail_mailboxes.owner_id
        and m.team_id = gmail_mailboxes.team_id
    )
  );
create policy gmail_mailbox_disconnect on public.gmail_mailboxes for delete to authenticated
  using ((select auth.uid()) = owner_id);
create policy gmail_attempt_owner on public.gmail_oauth_attempts for all to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and membership_id = (select id from public.team_members where owner_id = (select auth.uid()))
  );

-- Una reasignación administrativa invalida la conexión en lugar de moverla.
create function public.gmail_invalidate_membership_move() returns trigger
  language plpgsql security definer set search_path = '' as $$
begin
  delete from public.gmail_mailboxes where membership_id = old.id;
  delete from public.gmail_oauth_attempts where membership_id = old.id;
  return new;
end;
$$;
revoke all on function public.gmail_invalidate_membership_move() from public, anon, authenticated;

create trigger gmail_invalidate_membership_move
  before update of team_id, owner_id on public.team_members
  for each row when (old.team_id is distinct from new.team_id or old.owner_id is distinct from new.owner_id)
  execute function public.gmail_invalidate_membership_move();
