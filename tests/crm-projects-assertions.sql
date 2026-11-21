begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';

insert into public.crm_clients(id, name) values
  ('00000000-0000-4000-8000-000000000071', 'Cliente con proyectos'),
  ('00000000-0000-4000-8000-000000000072', 'Otro cliente');
insert into public.crm_projects(id, client_id, name) values
  ('00000000-0000-4000-8000-000000000073', '00000000-0000-4000-8000-000000000071', 'Proyecto A'),
  ('00000000-0000-4000-8000-000000000074', '00000000-0000-4000-8000-000000000071', 'Proyecto B');
insert into public.crm_project_stages(id, project_id, name, position)
values ('00000000-0000-4000-8000-000000000075', '00000000-0000-4000-8000-000000000073', 'Diseño', 0);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
do $$
declare
  client constant uuid := '00000000-0000-4000-8000-000000000071';
  other_client constant uuid := '00000000-0000-4000-8000-000000000072';
  project constant uuid := '00000000-0000-4000-8000-000000000073';
  other_project constant uuid := '00000000-0000-4000-8000-000000000074';
  stage constant uuid := '00000000-0000-4000-8000-000000000075';
  task uuid;
  revision uuid;
begin
  if (select count(*) from public.crm_projects where client_id = client) <> 2 then
    raise exception 'El socio no ve los dos proyectos del cliente';
  end if;
  update public.crm_projects set current_stage_id = stage where id = project;
  if not found then raise exception 'El socio no puede editar el proyecto'; end if;
  begin
    update public.crm_projects set current_stage_id = stage where id = other_project;
    raise exception 'Se aceptó una etapa de otro proyecto';
  exception when foreign_key_violation then null;
  end;
  begin
    update public.crm_projects set starts_on = '2026-12-05', due_on = '2026-12-01' where id = project;
    raise exception 'Se aceptaron fechas invertidas';
  exception when check_violation then null;
  end;
  begin
    insert into public.crm_project_assignees(project_id,user_id)
    values (project,'00000000-0000-4000-8000-000000000003');
    raise exception 'Se asignó el proyecto fuera del equipo';
  exception when check_violation then null;
  end;
  task := public.crm_save_task(null, jsonb_build_object('title','Primera tarea','priority','normal','project_id',project), array[auth.uid()]);
  perform public.crm_save_task(null, jsonb_build_object('title','Segunda tarea','priority','normal','project_id',project), array[]::uuid[]);
  if (select count(*) from public.crm_tasks where project_id = project and client_id = client) <> 2 then
    raise exception 'Faltan tareas vinculadas o no se heredó el cliente';
  end if;
  select edit_version into revision from public.crm_tasks where id = task;
  perform public.crm_save_task(task, jsonb_build_object('title','Primera edición','priority','normal','edit_version',revision), array[auth.uid()]);
  begin
    perform public.crm_save_task(task, jsonb_build_object('title','Edición anterior','priority','normal','edit_version',revision), array[]::uuid[]);
    raise exception 'Una edición antigua reemplazó la tarea';
  exception when sqlstate 'PT409' then null;
  end;
  select edit_version into revision from public.crm_projects where id = other_project;
  perform public.crm_save_project(other_project,
    jsonb_build_object('name','Proyecto B','client_id',client,'status','planned','edit_version',revision),
    '[{"id":"00000000-0000-4000-8000-000000000076","name":"Etapa nueva","position":0}]', array[auth.uid()]);
  begin
    perform public.crm_save_project(other_project,
      jsonb_build_object('name','Nombre anterior','client_id',client,'status','planned','edit_version',revision),
      '[]', array[]::uuid[]);
    raise exception 'Una edición antigua reemplazó las etapas del proyecto';
  exception when sqlstate 'PT409' then null;
  end;
  begin
    update public.crm_tasks set client_id = other_client where id = task;
    raise exception 'Se aceptó un cliente distinto al del proyecto';
  exception when check_violation or foreign_key_violation then null;
  end;
  begin
    update public.crm_projects set client_id = other_client where id = project;
    raise exception 'Se cambió de cliente con tareas vinculadas';
  exception when foreign_key_violation then null;
  end;
  perform public.crm_save_task(task, '{"title":"Tarea sin proyecto","priority":"normal","project_id":null}', array[]::uuid[]);
  if not exists (select 1 from public.crm_tasks where id = task and project_id is null and client_id = client) then
    raise exception 'Quitar el proyecto eliminó al cliente';
  end if;
  update public.crm_projects set client_id = other_client where id = other_project;
  if not found then raise exception 'No se pudo cambiar el cliente del proyecto vacío'; end if;
end $$;

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000003';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000003"}';
do $$
begin
  if exists (select 1 from public.crm_projects) or exists (select 1 from public.crm_project_stages)
    or exists (select 1 from public.crm_project_assignees) then
    raise exception 'Una cuenta externa accedió al proyecto';
  end if;
  begin
    perform public.crm_save_task(null, '{"title":"Intrusa","priority":"normal","project_id":"00000000-0000-4000-8000-000000000073"}', array[]::uuid[]);
    raise exception 'Una cuenta externa vinculó una tarea al proyecto';
  exception when check_violation then null;
  end;
end $$;

reset role;
delete from public.team_members where owner_id = '00000000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002"}';
do $$
begin
  if exists (select 1 from public.crm_tasks where title in ('Tarea sin proyecto','Segunda tarea')) then
    raise exception 'El exintegrante conservó tareas del cliente que había creado';
  end if;
end $$;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';
do $$
declare remaining_task uuid;
begin
  select id into remaining_task from public.crm_tasks where title = 'Segunda tarea';
  if remaining_task is null or not public.crm_set_task_status(remaining_task, 'done') then
    raise exception 'El cliente perdió el acceso a la tarea creada por el exintegrante';
  end if;
end $$;
rollback;
