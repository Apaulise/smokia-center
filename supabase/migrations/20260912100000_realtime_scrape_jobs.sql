-- Habilita Realtime para scrape_jobs: la UI de /leads/generar se suscribe a
-- los cambios de una corrida para mostrar el progreso sin polling (Plan §1.2,
-- paso 3). Sin esto, postgres_changes no emite nada aunque RLS ya lo permita.

do $do$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'scrape_jobs'
  ) then
    alter publication supabase_realtime add table public.scrape_jobs;
  end if;
end;
$do$;
