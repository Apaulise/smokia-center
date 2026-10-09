---
name: agregar-tabla
description: Receta para agregar una tabla a Awareness AI — migración con owner_id, RLS, las cuatro políticas con (select auth.uid()) y WITH CHECK, índices, trigger de updated_at y db:types. Usar al crear cualquier tabla nueva o al exponer una vista/función SQL sobre datos del usuario.
---

# Receta: agregar una tabla

Reglas de fondo en `CLAUDE.md` §4 y §10. Una tabla sin política es inaccesible (default correcto); una política mal escrita expone datos de otro usuario. Por eso se copia el molde, no se reinventa.

## Pasos, en este orden

1. **Migración nueva** en `supabase/migrations/`, nombre `YYYYMMDDHHMMSS_<tema>.sql` (posterior a la última existente; mirar con `Glob` antes de elegir el timestamp).
2. **Tabla** con `owner_id uuid not null references auth.users (id) on delete cascade`, `created_at`/`updated_at timestamptz not null default now()` y `id uuid primary key default gen_random_uuid()`.
3. **Índices**: `<tabla>_owner_idx on (owner_id)` siempre, y uno compuesto `(owner_id, <col>)` por cada columna de filtro u orden frecuente. Toda columna usada en una política lleva índice.
4. **Trigger** `updated_at` (si la tabla tiene esa columna).
5. **RLS**: `enable row level security` + las cuatro políticas (bloque abajo).
6. **Aplicar y tipar**: `npm run db:diff` para revisar, `npm run db:push`, `npm run db:types`. No hay base descartable: `db:push` impacta el proyecto real.

## Molde

```sql
create table public.<tabla> (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  -- columnas propias
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index <tabla>_owner_idx on public.<tabla> (owner_id);

create trigger <tabla>_set_updated_at before update on public.<tabla>
  for each row execute function public.set_updated_at();

do $do$
declare
  target text;
begin
  foreach target in array array['<tabla>']
  loop
    execute format('alter table public.%I enable row level security', target);

    execute format('drop policy if exists owner_select on public.%I', target);
    execute format(
      'create policy owner_select on public.%I for select to authenticated
       using ((select auth.uid()) = owner_id)', target
    );

    execute format('drop policy if exists owner_insert on public.%I', target);
    execute format(
      'create policy owner_insert on public.%I for insert to authenticated
       with check ((select auth.uid()) = owner_id)', target
    );

    execute format('drop policy if exists owner_update on public.%I', target);
    execute format(
      'create policy owner_update on public.%I for update to authenticated
       using ((select auth.uid()) = owner_id)
       with check ((select auth.uid()) = owner_id)', target
    );

    execute format('drop policy if exists owner_delete on public.%I', target);
    execute format(
      'create policy owner_delete on public.%I for delete to authenticated
       using ((select auth.uid()) = owner_id)', target
    );
  end loop;
end;
$do$;
```

Es el mismo bloque que usan `20260911120000_init_leads.sql` y `20260930120000_sales_goals.sql`: cada migración repite el loop con **su** array de tablas. No tocar migraciones ya aplicadas para sumar la tabla ahí.

## Qué no negociar

- `(select auth.uid())`, siempre envuelto en `select` (initPlan). Nunca `auth.uid()` pelado.
- `WITH CHECK` en insert **y** update; si falta en update, alguien puede reasignar `owner_id`.
- `drop policy if exists` + `create policy`: `CREATE POLICY` no tiene `IF NOT EXISTS` y la migración debe poder reejecutarse.
- `to authenticated`, nunca `public`/`anon`.
- Snake_case en la base, camelCase en TypeScript (se mapea en el borde). `database.types.ts` **no se edita a mano**.

## Casos que traen su propio cuidado

- **Vistas**: `with (security_invoker = true)`, si no, saltean el RLS de las tablas de abajo. Después `grant select ... to authenticated`.
- **Funciones SQL** sobre datos del usuario: `set search_path = ''`, nombres calificados (`public.x`), `SECURITY INVOKER` (default) para que RLS filtre igual. Si escriben, usar `(select auth.uid())` para el owner, y `revoke all ... from public, anon` + `grant execute ... to authenticated`.
- **Enums**: `create type public.<nombre> as enum (...)`. Agregar un valor a uno existente va en su propia migración.
- **Unicidad por usuario**: índice único que incluya `owner_id` (`unique (owner_id, slug)`), nunca global. Para "una sola activa por usuario", índice único parcial `(owner_id) where status = 'ACTIVA'`.
- **Realtime** (solo si la UI se suscribe): agregar la tabla a la publicación `supabase_realtime` con el bloque idempotente de `20260912100000_realtime_scrape_jobs.sql`. Sin eso `postgres_changes` no emite aunque RLS lo permita.
- **Escritura sin sesión** (webhook, cron): usa service role y saltea RLS, así que escribe `owner_id` explícito. Hoy eso vive en un solo archivo (`app/api/apify/webhook`) y cualquier cambio ahí se revisa a mano. No sumar un segundo lugar sin discutirlo.

## Verificación antes de dar por hecho

1. `npm run db:diff` no muestra nada inesperado y el SQL se puede correr dos veces sin error.
2. `npm run db:types` regeneró los tipos y `npm run typecheck` pasa.
3. Con la sesión de un usuario, la tabla devuelve solo sus filas; con otro, ninguna. Un `insert` con `owner_id` ajeno falla.
4. Según `CLAUDE.md` §13, si la tabla nace dentro de un `§x` del plan, el paso se cierra recién con el checklist manual en la app real.
