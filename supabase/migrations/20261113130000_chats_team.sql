-- ═══════════════════════════════════════════════════════════════════════════
-- Inbox compartido entre los socios (Plans/01-inbox-omnicanal-zernio.md, §1.25
-- sub-paso 6). Es opt-in: nada cambia hasta que el dueño de una cuenta la
-- comparte (chats_set_sharing), y se revierte con la misma función.
--
-- Es una excepción al aislamiento por owner_id (CLAUDE.md §4) y más sensible
-- que las de §1.23: acá el compañero ve el CONTENIDO de los mensajes, no
-- conteos. Por eso:
--
-- · Sin service role y sin SECURITY DEFINER: es RLS por equipo, el mismo
--   modelo que team_goals. La membresía (team_members) se siembra a mano y la
--   app no la puede escribir.
-- · Sólo se abre lo imprescindible para leer y responder: channel_accounts
--   (select), channel_secrets (select, para poder enviar), conversations
--   (select + update) y messages (select + update + insert de las respuestas
--   propias). Borrar y editar la cuenta sigue siendo sólo del dueño.
-- · El dueño de una fila no se puede reasignar (trigger chats_lock_owner de la
--   migración anterior).
-- · channel_secrets guarda texto cifrado con APP_ENCRYPTION_KEY: el compañero
--   puede leerlo (el servidor lo necesita para enviar en nombre de la cuenta),
--   pero sin esa clave no sirve de nada. Las pantallas nunca lo seleccionan.
--
-- Cualquier cambio de este archivo se revisa a mano.
-- ═══════════════════════════════════════════════════════════════════════════

-- Predicado reusado en todas las políticas: la fila está compartida con el
-- equipo del que llama. `team_members` sólo deja leer la propia fila, que es lo
-- que necesita esta subconsulta (sin recursión).
-- (No se hace función: una función por fila anula la optimización de initPlan.)

-- ── channel_accounts ───────────────────────────────────────────────────────

drop policy if exists owner_select on public.channel_accounts;
create policy owner_select on public.channel_accounts for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

-- Compartir sólo con el equipo propio (o dejar de compartir con null).
drop policy if exists owner_insert on public.channel_accounts;
create policy owner_insert on public.channel_accounts for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and (team_id is null
         or team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

drop policy if exists owner_update on public.channel_accounts;
create policy owner_update on public.channel_accounts for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (team_id is null
         or team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

-- ── channel_secrets ────────────────────────────────────────────────────────
-- Legible por el equipo SÓLO si la cuenta está compartida con él.

drop policy if exists owner_select on public.channel_secrets;
create policy owner_select on public.channel_secrets for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or exists (
      select 1
      from public.channel_accounts a
      where a.id = channel_secrets.channel_account_id
        and a.team_id is not null
        and a.team_id = (select team_id from public.team_members where owner_id = (select auth.uid()))
    )
  );

-- ── conversations ──────────────────────────────────────────────────────────

drop policy if exists owner_select on public.conversations;
create policy owner_select on public.conversations for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

drop policy if exists owner_update on public.conversations;
create policy owner_update on public.conversations for update to authenticated
  using (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  )
  with check (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

-- ── messages ───────────────────────────────────────────────────────────────

drop policy if exists owner_select on public.messages;
create policy owner_select on public.messages for select to authenticated
  using (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

-- El compañero sólo puede insertar SUS respuestas (salientes, desde el CRM, con
-- su id en sent_by) dentro de una conversación compartida con su equipo.
drop policy if exists owner_insert on public.messages;
create policy owner_insert on public.messages for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    or (
      team_id is not null
      and team_id = (select team_id from public.team_members where owner_id = (select auth.uid()))
      and sent_by = (select auth.uid())
      and direction = 'OUT'
      and origin = 'CRM'
    )
  );

drop policy if exists owner_update on public.messages;
create policy owner_update on public.messages for update to authenticated
  using (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  )
  with check (
    (select auth.uid()) = owner_id
    or (team_id is not null
        and team_id = (select team_id from public.team_members where owner_id = (select auth.uid())))
  );

-- ── Compartir / dejar de compartir una cuenta ──────────────────────────────
-- SECURITY INVOKER: RLS decide, así que sólo el dueño puede ejecutarla con
-- efecto. Pone (o saca) el team_id de la cuenta y de todo lo que ya cuelga de
-- ella; lo nuevo lo hereda de la cuenta al ingresar (lib/chats/ingest.ts).

create or replace function public.chats_set_sharing(p_account uuid, p_share boolean)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if p_share then
    select team_id into v_team
      from public.team_members
     where owner_id = (select auth.uid());
    if v_team is null then
      raise exception 'El usuario no pertenece a ningún equipo';
    end if;
  else
    v_team := null;
  end if;

  update public.channel_accounts
     set team_id = v_team
   where id = p_account
     and owner_id = (select auth.uid());

  if not found then
    raise exception 'Cuenta no encontrada';
  end if;

  update public.conversations
     set team_id = v_team
   where channel_account_id = p_account
     and owner_id = (select auth.uid());

  update public.messages m
     set team_id = v_team
    from public.conversations c
   where m.conversation_id = c.id
     and c.channel_account_id = p_account
     and m.owner_id = (select auth.uid());
end;
$$;

revoke all on function public.chats_set_sharing(uuid, boolean) from public, anon;
grant execute on function public.chats_set_sharing(uuid, boolean) to authenticated;
