# §1.23 — Objetivo y dashboard de equipo (Gestor de Leads)

> Plan aprobado el 2026-10-14. El estado de la implementación y el checklist manual (§13) viven en [Plans/01 §1.23](01-gestor-de-leads.md); este archivo es el plan tal como se aprobó.

## Context

La app ya es de dos usuarios (el dueño y su socio), cada uno con sus leads aislados por RLS (`owner_id`). Hoy el objetivo (§1.22, `sales_goals`) y todas las métricas son **por persona**. Pero son socios y operan como un solo negocio: quieren **un objetivo en común**, un **dashboard global** con las métricas de los dos juntos (leads, contactados, cerrados), y que **cada uno vea las métricas del otro** (cuántos contactó, cómo le va).

Decisiones ya tomadas con el usuario:
- **Una meta de equipo única** (facturación, ticket, tasas supuestas, días hábiles). Las tasas "que se ajustan solas" se calculan con los datos de los dos juntos. Cada uno ve su aporte contra la mitad de la meta.
- **Los dos pueden editar la meta.** Se archiva la versión anterior como hoy y queda quién la definió.
- Todo vive **dentro del Gestor de Leads** (no es el "Panel principal" de Fase 4, así que no rompe la regla de fases).

Límite de privacidad que propongo (sin preguntar, es el default razonable): el socio ve **agregados** (conteos, tasas, serie diaria), nunca los leads, mensajes ni notas del otro.

## Qué existe y se reutiliza

- Cadena pura: `lib/leads/execution/chain.ts` (`buildChain`, `workingDaysElapsed`), `blend.ts` (`blendRate`, `BOOKING_LAG_DAYS`).
- Agregador: `lib/leads/execution/summary.ts` (`getExecutionSummary`) — la parte de cálculo se extrae a una función pura reutilizable.
- Embudo: `lib/leads/prospecting-rates.ts` (`buildProspectingStages`), calendario `lib/leads/calendar.ts`, ingresos `lib/leads/goals.ts` (`manualTicketRevenue`).
- SQL de partida: `leads_execution_metrics` y `leads_daily_contacts` (`supabase/migrations/20260930120000_sales_goals.sql`, versión final de métricas en `20260930130000_execution_metrics_booking_window.sql`), `leads_prospecting_funnel` (`20260926160000_leads_prospecting_funnel.sql`).
- Perfiles: `public.profiles` (alias, avatar), `lib/profile/queries.ts` (`displayName`), componente `ProfileAvatar`.
- Pantallas: `app/(app)/leads/page.tsx`, `app/(app)/leads/objetivo/page.tsx`, `components/leads/execution/*`, `components/leads/dashboard/*`, nav en `components/shell/nav.ts`.

## Diseño

### Base de datos — migración `20261014120000_leads_team.sql` (posterior a `20261010120000`)

1. **`teams`** (`id`, `name`) y **`team_members`** (`owner_id` = el miembro, `team_id`; único por `owner_id`). RLS activo; `team_members` con política de lectura sólo de la propia fila. Sin políticas de escritura: la membresía no se toca desde la app (default correcto), se siembra a mano una vez.
2. **`team_goals`**: mismas columnas que `sales_goals` + `team_id`; `owner_id` = quién la definió. Una sola `ACTIVA` por equipo (índice único parcial por `team_id`). Políticas select/insert/update por **pertenencia al equipo** (`team_id = (select team_id from public.team_members where owner_id = (select auth.uid()))`, con `WITH CHECK` en escritura), sin recursión porque `team_members` es sólo-propia. Índices sobre `owner_id` y `team_id`. Trigger `updated_at`.
3. **RPC `team_define_goal(...)`** (SECURITY INVOKER, igual forma que `sales_define_goal`): archiva la activa del equipo e inserta la nueva, en transacción.
4. **Funciones de lectura cruzada — SECURITY DEFINER** (las primeras del repo; es la excepción nueva a documentar). Todas: `set search_path = ''`, nombres calificados, `revoke ... from public, anon`, `grant execute ... to authenticated`, y **primera línea verifica que `auth.uid()` y `p_owner` comparten equipo** (si no, devuelven vacío). Devuelven **sólo conteos**:
   - `team_directory()` → `owner_id`, alias (o parte local del mail como en `displayName`), `avatar_url` de los miembros.
   - `team_execution_metrics(p_owner, p_from, p_to, p_lag)` → mismas columnas que `leads_execution_metrics`.
   - `team_daily_contacts(p_owner, p_from, p_to, p_tz)` → `day`, `contacts`, `followups` (hoy los seguimientos se suman en TS en `getDailyContacts`; acá van en la función).
   - `team_prospecting_funnel(p_owner)` → mismas columnas que `leads_prospecting_funnel`.

   Estas funciones **no pueden usar `lead_first_contacts`** (la vista no tiene `owner_id`): el CTE de primer contacto se reescribe inline filtrando por `owner_id = p_owner` en `lead_messages` / `lead_activities`. Es SQL duplicado a propósito para no tocar las funciones personales que ya funcionan; se verifica por equivalencia (ver Verificación).
5. Después: `npm run db:diff` (mirar antes), `npm run db:push`, `npm run db:types`.

**Siembra única** (documentar en `SETUP.md`, no va en una migración para no versionar mails): SQL manual que crea el equipo y agrega a los dos usuarios por mail. Sin siembra, la app cae al modo actual (personal) — ver Edge cases.

### Código

- `lib/leads/team/queries.ts`: `getTeamDirectory`, `getTeamGoal`, `getTeamExecutionMetrics`, `getTeamDailyContacts`, `getTeamFunnel` (wrappers de las RPC, con Zod/tipos generados).
- Extraer de `lib/leads/execution/summary.ts` una función pura `deriveExecution(goal, windowMetrics, monthMetrics, series, today)`; `getExecutionSummary` y el nuevo resumen de equipo la comparten, para que ninguna pantalla calcule distinto.
- `lib/leads/team/summary.ts`: `getTeamSummary(windowDays)` → `{ goal, members: [{ ownerId, name, avatar, metrics, funnel, today/week/month }], total }`. El total **suma conteos** (todos aditivos) y recién después mezcla tasas con `blendRate` sobre el pool de los dos. Aporte individual = contactos propios vs `adjustedChain.contactsPerDay / nº de miembros`.
- `lib/leads/execution/actions.ts`: `defineSalesGoal` pasa a `defineTeamGoal` (Zod igual, llama `team_define_goal`). `getActiveSalesGoal` queda sólo para precargar el formulario con "tu meta personal anterior" la primera vez.
- **`/leads/objetivo`**: muestra la meta de equipo, la cadena con tasas ajustadas por el pool, y debajo "Aporte de cada uno" (contactos hoy/semana/mes vs su mitad, avatar + alias). El diálogo `goal-form-dialog.tsx` edita la meta compartida.
- **`/leads/equipo`** (nueva, ítem "Equipo" en `components/shell/nav.ts` + ícono en `sidebar.tsx`): selector segmentado **Equipo | Yo | Socio** (`?vista=` por search param). Vista Equipo: KPIs globales (leads, contactados, reuniones, ganados, conversión), embudo sumado, gráfico de contactos por día apilado por persona, y tarjetas comparativas por persona. Vistas individuales: los mismos widgets con los agregados de esa persona (de sólo lectura). Los widgets que exponen contenido de leads (ángulos, rubros, listas, "Atención") **no** se replican acá.
- **`/leads` (dashboard personal)**: sigue igual; el tile "Hoy X / Y" pasa a mostrar mi contacto del día contra mi mitad de la meta de equipo, con link a `/leads/equipo`.
- Antes de escribir pages: leer `node_modules/next/dist/docs/` (aviso del CLAUDE.md sobre cambios de Next 16, p. ej. `searchParams`).
- Gráficos: cargar la skill `dataviz` (CLAUDE.md §12); paleta de tokens de marca, cada persona un color fijo (cyan = acción/resultado, violeta = proceso).

### Docs

- `Plans/01-gestor-de-leads.md`: nuevo §1.23 con esto y su checklist; `CLAUDE.md` §1 (estado) y **§4**: documentar la segunda excepción al aislamiento (funciones DEFINER de equipo: sólo agregados, verifican equipo, `search_path=''`, cualquier cambio se revisa a mano) y que `team_goals` es la única tabla con RLS por equipo y no sólo por `owner_id`. Actualizar la skill `agregar-tabla` con la nota. `SETUP.md`: siembra del equipo.

## Edge cases

- **Sin equipo sembrado** o un solo miembro: `/leads/equipo` muestra sólo "Yo"; `/leads/objetivo` sigue funcionando con `team_goals` si hay equipo, o con `sales_goals` (modo actual) si no. Nada se rompe antes de la siembra.
- Un miembro que sale: se borra su fila de `team_members`; sus datos dejan de contar en el global, no se pierde nada.
- `AUTOMATION_OWNER_ID` (API de automatización) sigue atado a un solo owner: fuera de alcance; sus contactos cuentan igual porque entran como datos de ese owner.
- Zona horaria fija Argentina (ya es supuesto del repo): se mantiene.

## Verificación

1. `npm run build:verify` (nunca `npm run build`, CLAUDE.md §11) y `npm run lint`.
2. **Equivalencia SQL**: con el usuario propio, `team_execution_metrics(<mi id>, ...)` = `leads_execution_metrics(...)`, y lo mismo para `team_daily_contacts` / `team_prospecting_funnel` contra sus pares personales.
3. **Aislamiento**: llamar a las funciones con un `p_owner` que no es del equipo y como usuario sin equipo → vacío. Confirmar que un `select` directo a `leads`/`lead_messages` del socio sigue devolviendo 0 filas.
4. Checklist manual §13 (skill `checklist-manual`), ítem por ítem, con las dos cuentas: definir la meta con una, verla desde la otra; editarla desde la otra; el global suma lo correcto; "Yo" y "Socio" coinciden con el dashboard personal de cada uno; el socio no ve ningún lead ajeno.
