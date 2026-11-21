set role authenticated;
set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

do $$
declare
  won uuid := '00000000-0000-4000-8000-000000000021';
  open_lead uuid := '00000000-0000-4000-8000-000000000022';
  mate uuid := '00000000-0000-4000-8000-000000000002';
  outsider uuid := '00000000-0000-4000-8000-000000000003';
  client uuid;
begin
  client := public.crm_create_client('Empresa', 'onboarding', p_source => won, p_contact_name => 'Contacto', p_email => 'cliente@example.com');
  if client is distinct from public.crm_create_client('Empresa', 'active', p_source => won, p_contact_name => 'Duplicado') then
    raise exception 'La segunda conversión cambió el id';
  end if;
  if (select count(*) from public.crm_client_contacts where client_id = client) <> 1 then
    raise exception 'El contacto se duplicó';
  end if;
  perform public.crm_create_client('Cliente manual', 'active');
  begin
    perform public.crm_create_client('Prospecto', 'active', p_source => open_lead);
    raise exception 'Se convirtió un lead abierto';
  exception when check_violation then null;
  end;
  begin
    perform public.crm_create_client('Rollback', 'active', p_contact_name => '');
    raise exception 'Se aceptó el contacto sin nombre';
  exception when check_violation then null;
  end;
  if exists (select 1 from public.crm_clients where name = 'Rollback') then raise exception 'Alta parcial'; end if;

  insert into public.crm_tasks(id, title, assignee_id, lead_id, due_date)
  values ('00000000-0000-4000-8000-000000000041', 'Lead privado', mate, won, '2026-11-21');
  insert into public.crm_tasks(title, assignee_id, client_id)
  values ('Cliente privado', mate, client);
  insert into public.crm_tasks(title, assignee_id, conversation_id) values
  ('Chat compartido', mate, '00000000-0000-4000-8000-000000000031'),
  ('Chat privado', mate, '00000000-0000-4000-8000-000000000032');
  insert into public.crm_tasks(title) values ('Pendiente personal');
  if has_column_privilege(current_user, 'public.crm_tasks', 'completed_by', 'UPDATE') then
    raise exception 'El autor de la finalización se puede editar fuera de la operación de completar';
  end if;
  begin
    insert into public.crm_tasks(title, assignee_id) values ('Asignación ajena', outsider);
    raise exception 'Se asignó a un tercero';
  exception when check_violation then null;
  end;
  begin
    insert into public.crm_tasks(title, client_id, lead_id) values ('Doble contexto', client, won);
    raise exception 'Se aceptaron dos contextos';
  exception when check_violation then null;
  end;
end $$;

set request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
do $$
declare task uuid := '00000000-0000-4000-8000-000000000041';
begin
  if exists (select 1 from public.crm_clients) or exists (select 1 from public.crm_client_contacts)
  or exists (select 1 from public.crm_tasks) then raise exception 'Se filtraron filas privadas'; end if;
  if (select count(*) from public.crm_assigned_tasks()) <> 4 then raise exception 'Asignaciones incompletas'; end if;
  if exists (select 1 from public.crm_assigned_tasks() where lead_id is not null or client_id is not null
    or (title = 'Chat privado' and conversation_id is not null)) then raise exception 'Se filtró contexto'; end if;
  if not exists (select 1 from public.crm_assigned_tasks() where title = 'Chat compartido' and conversation_id is not null) then
    raise exception 'No se devolvió contexto visible';
  end if;
  if not public.crm_set_task_done(task, true) then raise exception 'No se completó'; end if;
  if not exists (select 1 from public.crm_assigned_tasks() where id = task and completed_at is not null and completed_by = auth.uid()) then
    raise exception 'No se registró fecha y autor';
  end if;
  if not public.crm_set_task_done(task, false) then raise exception 'No se reabrió'; end if;
  if not exists (select 1 from public.crm_assigned_tasks() where id = task and completed_at is null and completed_by is null and due_date = '2026-11-21') then
    raise exception 'No se restauró el pendiente';
  end if;
end $$;

reset role;
delete from public.team_members where owner_id = '00000000-0000-4000-8000-000000000002';
set role authenticated;
do $$
begin
  if exists (select 1 from public.crm_assigned_tasks()) then raise exception 'La asignación sobrevivió a la baja'; end if;
  if public.crm_set_task_done('00000000-0000-4000-8000-000000000041', true) then raise exception 'La baja permitió completar'; end if;
end $$;
reset role;
