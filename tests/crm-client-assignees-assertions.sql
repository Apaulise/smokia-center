begin;
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001"}';

do $$
declare
  owner_id constant uuid := '00000000-0000-4000-8000-000000000001';
  partner constant uuid := '00000000-0000-4000-8000-000000000002';
  outsider constant uuid := '00000000-0000-4000-8000-000000000003';
  client uuid;
begin
  client := public.crm_write_client(null, 'Cliente compartido', 'renewal', array[owner_id, partner, partner],
    p_contact_name => 'Contacto de prueba', p_job_title => 'Compras');
  if (select assignee_id from public.crm_clients where id = client) is distinct from owner_id
    or (select count(*) from public.crm_client_additional_assignees where client_id = client and user_id = partner) <> 1
    or (select job_title from public.crm_client_contacts where client_id = client) is distinct from 'Compras' then
    raise exception 'No se guardaron ambos responsables y el contacto';
  end if;
  perform set_config('request.jwt.claim.sub', partner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', partner)::text, true);
  if not exists (select 1 from public.crm_client_additional_assignees where client_id = client) then
    raise exception 'El socio no ve a los responsables';
  end if;
  begin
    perform public.crm_write_client(client, 'No guardar', 'completed', array[owner_id, outsider]);
    raise exception 'Se asignó un cliente fuera del equipo';
  exception when check_violation then null;
  end;
  if not exists (select 1 from public.crm_clients where id = client and status = 'renewal')
    or not exists (select 1 from public.crm_client_additional_assignees where client_id = client and user_id = partner) then
    raise exception 'Un error modificó parcialmente el cliente';
  end if;
  perform set_config('request.jwt.claim.sub', outsider::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', outsider)::text, true);
  if exists (select 1 from public.crm_client_additional_assignees where client_id = client)
    or public.crm_write_client(client, 'No guardar', 'archived', array[]::uuid[]) is not null then
    raise exception 'Una cuenta externa obtuvo acceso al cliente';
  end if;
  perform set_config('request.jwt.claim.sub', partner::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', partner)::text, true);
  perform public.crm_write_client(client, 'Cliente finalizado', 'completed', array[]::uuid[]);
  if (select assignee_id from public.crm_clients where id = client) is not null
    or exists (select 1 from public.crm_client_additional_assignees where client_id = client) then
    raise exception 'No se limpiaron los responsables';
  end if;
end
$$;
rollback;
