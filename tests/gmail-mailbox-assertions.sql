-- Run against a migrated test database. The test rows are rolled back.
begin;

insert into auth.users(id, email) values
  ('6af59968-15f5-47b4-a9bb-264512cc0001', 'gmail-owner@example.test'),
  ('6af59968-15f5-47b4-a9bb-264512cc0002', 'gmail-partner@example.test'),
  ('6af59968-15f5-47b4-a9bb-264512cc0003', 'gmail-outsider@example.test');
insert into public.teams(id, owner_id, name) values
  ('6af59968-15f5-47b4-a9bb-264512cc0011', '6af59968-15f5-47b4-a9bb-264512cc0001', 'Correo de prueba'),
  ('6af59968-15f5-47b4-a9bb-264512cc0012', '6af59968-15f5-47b4-a9bb-264512cc0003', 'Correo de otro equipo');
insert into public.team_members(id, owner_id, team_id) values
  ('6af59968-15f5-47b4-a9bb-264512cc0021', '6af59968-15f5-47b4-a9bb-264512cc0001', '6af59968-15f5-47b4-a9bb-264512cc0011'),
  ('6af59968-15f5-47b4-a9bb-264512cc0022', '6af59968-15f5-47b4-a9bb-264512cc0002', '6af59968-15f5-47b4-a9bb-264512cc0011'),
  ('6af59968-15f5-47b4-a9bb-264512cc0023', '6af59968-15f5-47b4-a9bb-264512cc0003', '6af59968-15f5-47b4-a9bb-264512cc0012');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6af59968-15f5-47b4-a9bb-264512cc0001"}', true);
insert into public.gmail_mailboxes(team_id, owner_id, membership_id, email, refresh_token_encrypted)
  values ('6af59968-15f5-47b4-a9bb-264512cc0011', '6af59968-15f5-47b4-a9bb-264512cc0001',
          '6af59968-15f5-47b4-a9bb-264512cc0021', 'correo-fixture@gmail.com', 'cifrado de prueba');
do $$begin
  if not exists (select 1 from public.gmail_mailboxes) then raise exception 'El titular no ve su casilla'; end if;
end$$;

select set_config('request.jwt.claims', '{"sub":"6af59968-15f5-47b4-a9bb-264512cc0002"}', true);
do $$begin
  if exists (select 1 from public.gmail_mailboxes) then raise exception 'El socio ve una casilla privada'; end if;
end$$;

select set_config('request.jwt.claims', '{"sub":"6af59968-15f5-47b4-a9bb-264512cc0001"}', true);
update public.gmail_mailboxes set shared = true;
select set_config('request.jwt.claims', '{"sub":"6af59968-15f5-47b4-a9bb-264512cc0002"}', true);
do $$begin
  if not exists (select 1 from public.gmail_mailboxes where shared) then raise exception 'El socio no ve la casilla compartida'; end if;
  update public.gmail_mailboxes set shared = false;
  if found then raise exception 'El socio puede cambiar el permiso'; end if;
  delete from public.gmail_mailboxes;
  if found then raise exception 'El socio puede desconectar la casilla'; end if;
end$$;

select set_config('request.jwt.claims', '{"sub":"6af59968-15f5-47b4-a9bb-264512cc0003"}', true);
do $$begin
  if exists (select 1 from public.gmail_mailboxes) then raise exception 'Otro equipo ve la casilla'; end if;
end$$;

reset role;
update public.team_members set team_id = '6af59968-15f5-47b4-a9bb-264512cc0012'
  where id = '6af59968-15f5-47b4-a9bb-264512cc0022';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"6af59968-15f5-47b4-a9bb-264512cc0002"}', true);
do $$begin
  if exists (select 1 from public.gmail_mailboxes) then raise exception 'El exsocio conserva acceso'; end if;
end$$;

reset role;
update public.team_members set team_id = '6af59968-15f5-47b4-a9bb-264512cc0012'
  where id = '6af59968-15f5-47b4-a9bb-264512cc0021';
do $$begin
  if exists (select 1 from public.gmail_mailboxes where team_id = '6af59968-15f5-47b4-a9bb-264512cc0011') then
    raise exception 'La conexión sobrevivió al cambio de equipo del titular';
  end if;
end$$;
rollback;
