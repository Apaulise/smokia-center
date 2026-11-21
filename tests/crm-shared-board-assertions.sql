-- Ejecutar sobre el entorno descartable con crm-sql-fixture.sql y ambas migraciones.
begin;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';

insert into public.crm_clients (id, name)
values ('00000000-0000-4000-8000-000000000051', 'Empresa del equipo');

insert into public.crm_tasks (id, title, client_id)
values ('00000000-0000-4000-8000-000000000052', 'Tarea sin asignar al socio', '00000000-0000-4000-8000-000000000051');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';

do $$
declare
  company uuid := '00000000-0000-4000-8000-000000000051';
  task uuid := '00000000-0000-4000-8000-000000000052';
  creator uuid := '00000000-0000-4000-8000-000000000001';
  outsider uuid := '00000000-0000-4000-8000-000000000003';
begin
  if not exists (select 1 from public.crm_tasks where id = task and assignee_id = creator and status = 'pending') then
    raise exception 'El compañero no puede ver una tarea ajena sin asignación';
  end if;
  update public.crm_clients set assignee_id = auth.uid(), notes = 'Editada por el socio' where id = company;
  if not found then raise exception 'El compañero no puede editar la empresa'; end if;
  insert into public.crm_client_contacts (client_id, name) values (company, 'Contacto compartido');
  if not exists (select 1 from public.crm_client_contacts where client_id = company and owner_id = creator) then
    raise exception 'El contacto no heredó el dueño de la empresa';
  end if;
  update public.crm_tasks set assignee_id = auth.uid() where id = task;
  if not found then raise exception 'El compañero no puede reasignar la tarea'; end if;
  if not public.crm_set_task_status(task, 'in_progress') then raise exception 'El socio no pudo mover la tarea'; end if;
  if not exists (select 1 from public.crm_tasks where id = task and status = 'in_progress' and completed_at is null) then
    raise exception 'No se guardó el estado en curso';
  end if;
  if not public.crm_set_task_status(task, 'done') then raise exception 'El socio no pudo completar la tarea'; end if;
  if not exists (select 1 from public.crm_tasks where id = task and status = 'done' and completed_at is not null and completed_by = auth.uid()) then
    raise exception 'No se completó con autor y fecha';
  end if;
  if has_column_privilege(current_user, 'public.crm_tasks', 'status', 'UPDATE') then
    raise exception 'Se puede omitir el RPC que sincroniza la finalización';
  end if;
  begin
    update public.crm_clients set assignee_id = outsider where id = company;
    raise exception 'Se asignó un cliente fuera del equipo';
  exception when check_violation then null;
  end;
  begin
    update public.crm_tasks set assignee_id = outsider where id = task;
    raise exception 'Se asignó una tarea fuera del equipo';
  exception when check_violation then null;
  end;
  begin
    update public.crm_tasks set client_id = null, lead_id = '00000000-0000-4000-8000-000000000021' where id = task;
    raise exception 'Se vinculó un lead privado del compañero';
  exception when check_violation then null;
  end;
end
$$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003"}';
do $$
begin
  if exists (select 1 from public.crm_clients where id = '00000000-0000-4000-8000-000000000051')
    or exists (select 1 from public.crm_client_contacts where client_id = '00000000-0000-4000-8000-000000000051')
    or exists (select 1 from public.crm_tasks where id = '00000000-0000-4000-8000-000000000052')
    or public.crm_set_task_status('00000000-0000-4000-8000-000000000052', 'pending') then
    raise exception 'Una cuenta ajena accedió a datos del equipo';
  end if;
end
$$;

reset role;
delete from public.team_members where owner_id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
do $$
begin
  if exists (select 1 from public.crm_clients where id = '00000000-0000-4000-8000-000000000051')
    or public.crm_set_task_status('00000000-0000-4000-8000-000000000052', 'pending') then
    raise exception 'Se mantuvo el acceso después de perder la membresía';
  end if;
end
$$;

rollback;
