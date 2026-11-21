begin;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';
insert into public.crm_tasks(id, title)
values ('00000000-0000-4000-8000-000000000061', 'Colaboración');
select public.crm_create_client('Empresa con cargo', 'active', p_contact_name => 'Contacto', p_job_title => 'Operaciones');

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
do $$
declare
  task uuid := '00000000-0000-4000-8000-000000000061';
  owner uuid := '00000000-0000-4000-8000-000000000001';
  partner uuid := '00000000-0000-4000-8000-000000000002';
  outsider uuid := '00000000-0000-4000-8000-000000000003';
  team uuid := '00000000-0000-4000-8000-000000000011';
begin
  if not exists (select 1 from public.crm_client_contacts where name = 'Contacto' and job_title = 'Operaciones') then
    raise exception 'No se guardó el cargo del contacto';
  end if;
  insert into public.crm_board_colors(team_id,status,color) values (team,'pending','purple')
   on conflict (team_id,status) do update set color = excluded.color;
  perform public.crm_save_task(task, '{"title":"Tarea compartida","priority":"high"}', array[owner, partner, owner]);
  if (select count(*) from public.crm_task_assignees where task_id = task) <> 2 then
    raise exception 'Se esperaban dos responsables únicos';
  end if;
  begin
    perform public.crm_save_task(task, '{"title":"Cambio inválido","priority":"high"}', array[outsider]);
    raise exception 'Se asignó a una cuenta externa';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.crm_tasks where id = task and title = 'Tarea compartida')
    or (select count(*) from public.crm_task_assignees where task_id = task) <> 2 then
    raise exception 'La edición incompleta alteró la tarea';
  end if;
end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003"}';
do $$
begin
  if exists (select 1 from public.crm_task_assignees where task_id = '00000000-0000-4000-8000-000000000061')
    or exists (select 1 from public.crm_board_colors where team_id = '00000000-0000-4000-8000-000000000011') then
    raise exception 'Las asignaciones quedaron expuestas a un tercero';
  end if;
end $$;

reset role;
delete from public.team_members where owner_id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
do $$
begin
  if exists (select 1 from public.crm_task_assignees where task_id = '00000000-0000-4000-8000-000000000061')
    or exists (select 1 from public.crm_board_colors where team_id = '00000000-0000-4000-8000-000000000011') then
    raise exception 'La asignación mantuvo el acceso tras salir del equipo';
  end if;
end $$;

rollback;
