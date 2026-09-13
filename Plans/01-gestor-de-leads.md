# Awareness AI — Panel de negocio

## Context

Hoy el directorio del proyecto sólo contiene `Awareness_AI_Manual_de_Marca.md`. No hay código.

El objetivo es construir el panel central de Awareness AI con la estructura del diagrama: un **Panel principal** que da acceso a las tres patas del negocio — **Gestor de Leads**, **Gestor de Facturación** y **Gestor de Marca Personal**.

La regla de trabajo definida es **un gestor por vez, y cuando uno termina queda usable aunque los demás no existan**. Por eso se construye primero una base compartida mínima (auth, base de datos, sistema de diseño, layout) y encima de ella el **Gestor de Leads** completo y en producción. Facturación, Marca Personal y el Panel principal quedan como fases posteriores, con el shell ya preparado para recibirlos.

El corazón del Gestor de Leads es generar listas de leads por **rubro y zona** usando Apify con una API key configurable desde la app, categorizarlas por rubro y hacerles seguimiento de estado hasta el cierre.

### Decisiones ya tomadas

| Decisión | Elección |
|---|---|
| Despliegue | Nube desde el día 1 — Vercel + Supabase |
| Base de datos y auth | **Supabase** (Postgres + Auth + RLS), sin ORM |
| Login | Google OAuth vía Supabase Auth |
| Modelo de usuarios | Una sola cuenta hoy, pero **multi-tenant impuesto por RLS** |
| Fuentes de leads | Google Maps, CSV/manual, Instagram y LinkedIn (vía Apify) |
| Contacto | Links `wa.me` / `mailto` con plantilla + registro manual del resultado |
| Objetivo diario de contacto | **Diferido** — se construye junto al Gestor de Facturación |

---

## Stack

- **Next.js 16** (App Router, Server Components + Server Actions) + **TypeScript** estricto
- **Supabase**: Postgres, Auth (Google), Row Level Security y Realtime
- **`@supabase/ssr`** + **`@supabase/supabase-js`** para clientes con sesión en cookies
- **Supabase CLI** para migraciones SQL versionadas y generación de tipos
- **Tailwind CSS v4** + **shadcn/ui**, re-tematizado con los tokens del manual de marca
- **Zod** para validar todo input (formularios, server actions, y la salida de Apify)
- **Vercel** para hosting y variables de entorno

**Sin ORM.** Se consulta con el query builder de `supabase-js` sobre tipos generados desde el esquema real (`supabase gen types typescript`), así que las queries siguen siendo tipadas de punta a punta sin una capa de mapeo intermedia. Convención Postgres: **snake_case** en tablas y columnas.

---

## Fase 0 — Fundaciones compartidas

Base mínima para que cualquier gestor se monte encima. No es un gestor: es el andamio.

### 0.0 `CLAUDE.md` — primero, antes que el código

Se escribe en la raíz del workspace **como primera tarea**, para que todo lo que venga después se escriba contra reglas ya fijadas. Secciones:

1. **Qué es Awareness AI** — el negocio y las tres patas del diagrama
2. **Regla de fases** — un gestor por vez; no se arranca el siguiente hasta que el anterior esté desplegado y en uso real
3. **Arquitectura** — mapa de carpetas, qué vive en cada una, y el flujo de una generación de leads de punta a punta
4. **Reglas de datos (las no negociables):**
   - RLS activo en **toda** tabla nueva, sin excepción; una tabla sin política es una tabla inaccesible
   - Toda tabla lleva `owner_id uuid references auth.users`, con índice
   - Las políticas se escriben `(select auth.uid()) = owner_id` — envolver en `select` habilita la optimización de initPlan de Postgres
   - Todo `INSERT`/`UPDATE` lleva `WITH CHECK`, para que nadie pueda reasignar `owner_id`
   - La **service role key** sólo se usa en el webhook de Apify y en rutas de cron. Nunca en un Server Component, nunca cerca del cliente. Como saltea RLS, esas rutas filtran por `owner_id` explícitamente y eso se revisa a mano
   - En código de servidor se usa `getClaims()`, **nunca `getSession()`** — `getSession()` no garantiza revalidar el token
5. **Convenciones de código** — snake_case en la base y camelCase en TS; server actions para mutaciones; Zod en el borde; tipos generados, nunca escritos a mano
6. **Marca** — tabla de tokens, tipografías, y la convención *cyan = acción/resultado, violeta = proceso/innovación*; referencia a `Awareness_AI_Manual_de_Marca.md`
7. **Idioma** — toda la UI en español, con el vocabulario del negocio (rubro, zona, facturación)
8. **Comandos** — `dev`, `build`, `db:migrate`, `db:types`, `db:reset`, `supabase start`
9. **Receta: agregar una fuente de leads nueva** (§1.2), paso a paso
10. **Receta: agregar una tabla nueva** — migración + RLS + índice + regenerar tipos, en ese orden
11. **Gotchas** — el webhook de Apify no viene firmado; Apify no alcanza `localhost`; Vercel Cron en plan Hobby corre una vez por día
12. **Nota** — cargar la skill `dataviz` antes de escribir cualquier gráfico

### 0.1 Proyecto y base de datos

- `create-next-app` con TypeScript, Tailwind, App Router, alias `@/*`
- `supabase init` → carpeta `supabase/` con `config.toml` y `migrations/`
- Migraciones como **SQL plano y versionado** en `supabase/migrations/`, no generado por un ORM. Las políticas se crean dentro de bloques `DO $$ ... $$` que chequean existencia, porque `CREATE POLICY` no tiene `IF NOT EXISTS` y eso rompe reejecutar una migración
- `npm run db:types` → `supabase gen types typescript` hacia `lib/supabase/database.types.ts`. **Se regenera después de cada migración**; ese archivo no se edita a mano
- `.env.example` documentando cada variable:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`

### 0.2 Autenticación y aislamiento por usuario

- Supabase Auth con **Google OAuth**; callback en `app/auth/callback/route.ts`
- Tres clientes en `lib/supabase/`:
  - `client.ts` → `createBrowserClient` (componentes cliente)
  - `server.ts` → `createServerClient` con cookies (Server Components y Actions)
  - `admin.ts` → service role, **con un comentario en la primera línea advirtiendo que saltea RLS**. Sólo importable desde `app/api/`
- `middleware.ts` refresca el token en cada request y protege el grupo `(app)`; sólo `/login` es público

**El cambio de fondo respecto a un ORM:** el aislamiento por usuario no depende de que cada query se acuerde de filtrar. Cada tabla tiene RLS activo y una política `(select auth.uid()) = owner_id`. Si mañana entra un SDR, ve sus datos porque lo dice Postgres, no porque el código se haya portado bien. Un bug en una query no puede filtrar datos de otro usuario.

### 0.3 Sistema de diseño (desde el manual de marca)

App **dark-only** — el manual es dark-first y no define paleta clara, así que no se inventa una.

- `app/globals.css` con los tokens exactos del manual como CSS variables:
  ```css
  --bg:#070B17; --bg-2:#0C1730; --surface:#12213E;
  --cyan:#18D6E8; --cyan-soft:#72F4F1;
  --violet:#7C3AED; --purple:#4C1D95;
  --text:#F4F7FF; --text-muted:#AAB8D4; --border:#2B416D;
  --gradient-primary: linear-gradient(135deg,#18D6E8 0%,#4C7DFF 45%,#7C3AED 100%);
  ```
- Tipografías vía `next/font/google`: **Sora** (titulares), **Inter** (cuerpo/UI), **JetBrains Mono** (números y datos)
- Escala de espaciado 8/16/24/32/48/64; radios 16–24px en contenedores
- **Convención de color codificada en las variantes de los componentes**, no dejada al criterio de cada pantalla: *cyan = acción y resultado*, *violeta = proceso e innovación* (§9 del manual)
- Glow contenido (10–30% de opacidad) reservado para el foco principal de cada pantalla. Un solo efecto protagonista por vista
- Componentes base en `components/ui/`: `Button` (gradiente / borde translúcido), `Card`, `Badge`, `StatTile`, `Table`, `Dialog`, `Select`, `Input`, `EmptyState`, `Toast`

### 0.4 Shell de navegación

Sidebar con las cuatro entradas del diagrama desde el día 1:

- **Panel principal** → placeholder "Próximamente"
- **Gestor de Leads** → activo
- **Gestor de Facturación** → deshabilitado, visible
- **Gestor de Marca Personal** → deshabilitado, visible

Dejarlos visibles pero apagados hace que la estructura del negocio se lea completa desde el principio y evita rediseñar la navegación en cada fase.

### 0.5 Configuración y secretos de usuario

Pantalla `/configuracion` donde se carga la **API key de Apify** (pedido explícito: configurable dentro de la app, no en `.env`).

- Tabla `settings` con `unique(owner_id, key)`, RLS activo, y el valor cifrado **AES-256-GCM** con `APP_ENCRYPTION_KEY` (32 bytes en base64). Se guarda `iv + authTag + ciphertext`
- Dos capas a propósito: RLS impide que otro usuario lea la fila; el cifrado hace que un dump de la base tampoco sirva
- `lib/crypto.ts` con `encrypt()` / `decrypt()`; el token **nunca** se loguea, nunca vuelve al cliente, y en la UI se muestra enmascarado (`apify_api_••••3f2a`)
- Botón "Probar conexión" → `GET /v2/users/me` para validar la key antes de guardarla
- Además de la key: rubros propios, plantillas de mensajes y actores de Apify configurables

---

## Fase 1 — Gestor de Leads

Esta es la fase que tiene que terminar **desplegada y en uso**. Cubre las 4 secciones vigentes del diagrama; la quinta (objetivo diario) queda diferida por decisión explícita.

### 1.1 Esquema de datos

Migración SQL en `supabase/migrations/`. Toda tabla: `owner_id uuid not null references auth.users(id) on delete cascade`, índice sobre `owner_id`, RLS activo y las cuatro políticas (select/insert/update/delete).

- **`industries`** (Rubros) — `name`, `slug`, `color`. Catálogo propio, sembrado con rubros comunes y editable
- **`lead_lists`** — una lista generada: `name`, `source`, `criteria jsonb` (rubro + zona + filtros), `status`, `lead_count`
- **`leads`** — `name`, `phone`, `email`, `website`, `address`, `city`, `region`, `lat/lng`, `rating`, `reviews_count`, `instagram_url`, `linkedin_url`, `source_url`, `external_id`, `raw jsonb` (payload original para no perder datos), `status`, `notes`, `last_contacted_at`, `next_action_at`, FK a `lead_lists` e `industries`
- **`lead_activities`** — timeline de seguimiento: `type` (NOTA / WHATSAPP / EMAIL / LLAMADA / CAMBIO_ESTADO / REUNION), `from_status`, `to_status`, `content`, `occurred_at`
- **`scrape_jobs`** — una corrida de Apify: `provider`, `actor_id`, `apify_run_id`, `apify_dataset_id`, `status`, `input jsonb`, `error`, `items_imported`, `cost_usd`, `webhook_secret`
- **`appointments`** — agenda propia: `starts_at`, `ends_at`, `title`, `notes`, `meeting_url`, `status`, FK opcional a `leads`
- **`message_templates`** — plantillas con variables `{{nombre}}`, `{{rubro}}`, `{{ciudad}}`

**Estados del lead** (enum Postgres `lead_status`): `NUEVO → CONTACTADO → RESPONDIO → AGENDADO → PROPUESTA_ENVIADA → CERRADO_GANADO | CERRADO_PERDIDO | DESCARTADO`

**Deduplicación** — la parte que decide si la herramienta sirve o se llena de basura. Columna `dedupe_key` calculada al importar, con `unique(owner_id, dedupe_key)`, en este orden de prioridad: teléfono normalizado a E.164 → dominio del sitio web → `source_url` → slug de `nombre + ciudad`. La importación usa `upsert` con `onConflict: 'owner_id,dedupe_key'`, así que reimportar la misma zona enriquece los leads existentes en vez de duplicarlos.

**Índices** — más allá de `owner_id` (obligatorio, porque sin él cada política RLS provoca un scan secuencial): `leads(owner_id, status)`, `leads(owner_id, industry_id)`, `leads(owner_id, lead_list_id)`, `appointments(owner_id, starts_at)`.

### 1.2 Generación de listas — capa de proveedores

Con cuatro fuentes, la integración no puede ser código de Google Maps con `if`s: es un registro de proveedores.

`lib/providers/types.ts`:

```ts
export interface LeadSourceProvider {
  id: LeadSource
  label: string
  defaultActorId: string          // sobreescribible desde /configuracion
  criteriaSchema: ZodSchema       // el form de /leads/generar se renderiza desde acá
  buildInput(criteria): object    // criterios → input del actor de Apify
  mapItem(item: unknown): NormalizedLead | null   // item del dataset → nuestro lead
  estimateCost(criteria): number
}
```

`lib/providers/registry.ts` los indexa. Agregar una fuente = un archivo nuevo + una línea en el registro.

**Flujo de una generación:**

1. `/leads/generar` — el form se arma desde el `criteriaSchema` del proveedor elegido (rubro, zona, cantidad máxima, filtros). Antes de lanzar, muestra el **costo estimado**
2. Server action: crea `lead_lists(PENDING)` + `scrape_jobs`, descifra el token de Apify y hace `POST /v2/acts/{actorId}/runs`, registrando webhooks `ACTOR.RUN.SUCCEEDED` y `ACTOR.RUN.FAILED` hacia `/api/apify/webhook?jobId=…&secret=…`
3. Apify corre en background. La UI se suscribe por **Supabase Realtime** a los cambios de esa fila de `scrape_jobs`, así que el progreso aparece solo, sin polling
4. **Webhook** (`app/api/apify/webhook/route.ts`): compara el secreto con `timingSafeEqual` y **descarta el cuerpo del request como fuente de datos**. Apify no firma criptográficamente sus webhooks, así que el POST sólo se toma como señal de "el job X puede haber terminado". El servidor re-consulta `GET /v2/actor-runs/{runId}` con nuestro propio token, confirma estado y dueño, lee `defaultDatasetId`, pagina el dataset, mapea con `provider.mapItem`, deduplica y hace upsert
5. **Reconciliación** — un webhook se puede perder, y en desarrollo local Apify no puede alcanzar `localhost`. Por eso el import vive en `lib/apify/reconcile.ts` y se dispara desde tres lados: el webhook, un chequeo al abrir la pantalla de jobs, y `GET /api/jobs/reconcile` protegido por `CRON_SECRET`. La reconciliación es **idempotente** (upsert + `items_imported`), así que las tres rutas pueden pisarse sin duplicar nada

> **Seguridad del webhook:** no hay sesión de usuario en un webhook, así que esa ruta usa la service role key y **saltea RLS**. Por eso resuelve el `owner_id` desde la fila de `scrape_jobs` y lo escribe explícitamente en cada lead insertado. Es el único lugar del código donde el aislamiento depende del código y no de la base — y por eso está aislado en un solo archivo y marcado como tal en `CLAUDE.md`.

> **Vercel Cron:** en plan Hobby la frecuencia máxima es diaria. Por eso Realtime + el chequeo al abrir la pantalla son el mecanismo principal y el cron es un extra. La app funciona completa sin cron.

**Proveedores, en orden de implementación:**

| Proveedor | Actor | Nota |
|---|---|---|
| **Google Maps** | `compass/crawler-google-places` | El motor real de "rubro + zona". Devuelve nombre, dirección, teléfono, web, rating, categoría. Desde ~US$1.50/1000 lugares. **Es el único que mapea 1:1 con el pedido original** |
| **CSV / manual** | — | Parseo local con mapeo de columnas. Sin costo ni API: es la red de seguridad cuando Apify falla o no hay crédito |
| **Instagram** | `apify/instagram-scraper` | Busca por hashtag o ubicación, no por "rubro+zona". El rubro se aproxima con hashtags (`#peluqueriapalermo`). Aporta perfiles, no fichas de negocio |
| **LinkedIn** | actor configurable | El más frágil y caro: la mayoría de los actores piden URLs de empresa como input en vez de una búsqueda por zona. Se deja configurable en `/configuracion` porque estos actores cambian seguido |

Las cuatro fuentes entran en esta fase, en ese orden. Google Maps + CSV ya hacen el gestor utilizable; Instagram y LinkedIn se suman detrás de la misma interfaz sin tocar la UI.

**Control de costo:** cada `scrape_job` guarda el `usageTotalUsd` que devuelve la corrida, y la pantalla de jobs muestra el gasto acumulado por lista. Con pricing por resultado, saber cuánto salió cada lista importa tanto como los leads.

### 1.3 Lista de leads y seguimiento

`/leads/lista`

- Tabla con filtros combinables por **rubro**, estado, lista de origen, ciudad y búsqueda de texto; ordenable; paginada del lado del servidor con `.range()`
- Cada rubro se muestra como badge con su color — la categorización por rubro pedida
- Cambio de estado inline; cada cambio escribe una fila en `lead_activities` automáticamente (el historial no depende de que uno se acuerde de anotar)
- Acciones masivas: asignar rubro, cambiar estado, exportar CSV, borrar
- Vista **Kanban** opcional por estado, para arrastrar el pipeline

`/leads/[id]` — ficha del lead

- Datos de contacto con acciones: **WhatsApp** (`wa.me` con la plantilla ya resuelta), **email** (`mailto`), sitio web, Google Maps
- Al usar una acción de contacto, un diálogo registra el resultado en un clic y avanza el estado
- Timeline completo de actividades
- Botón "Agendar" que crea un turno ligado al lead
- Notas libres y próxima acción con fecha

### 1.4 Dashboard del gestor

`/leads` — es la home del gestor.

- **StatTiles**: leads totales, contactados, agendadas, cerrados ganados, tasa de conversión
- Embudo por estado
- Evolución de contactos y cierres en el tiempo
- Distribución por rubro
- Rendimiento por lista de origen — **qué combinación de rubro y zona cierra mejor**, que es lo que después justifica en qué gastar crédito de Apify
- Próximas reuniones y leads sin tocar hace más de N días

Los agregados pesados se resuelven con **funciones Postgres** (`create function` en una migración) llamadas por `supabase.rpc()`, en vez de traer filas al servidor para contarlas.

> Antes de escribir el primer gráfico, cargar la skill `dataviz`. La paleta de series tiene que salir de los tokens de marca, no de los colores por defecto de la librería.

### 1.5 Agenda

`/leads/agenda` — calendario propio, sin dependencia de Google Calendar (el diagrama dice "calendario propio").

- Vistas mes y semana + lista de próximos turnos
- Crear/editar/mover turnos; cada uno puede colgar de un lead
- Estados: agendada, confirmada, realizada, no asistió, cancelada
- Marcar "realizada" ofrece avanzar el estado del lead en el mismo paso
- Exportación `.ics` para suscribirse desde el celular

### 1.6 Objetivo diario — diferido

No se construye ahora. Queda un stub en `lib/leads/goals.ts` con la interfaz que después leerá la facturación real, para que al construir el Gestor de Facturación sólo haya que implementarla y encender la sección.

---

## Fases siguientes (fuera de alcance ahora)

- **Fase 2 — Gestor de Facturación.** Al terminarlo, se implementa §1.6 y se enciende la sección de objetivo diario en Leads
- **Fase 3 — Gestor de Marca Personal**
- **Fase 4 — Panel principal.** Recién con los tres gestores vivos: agrega las métricas de las tres patas del negocio

---

## Archivos principales

```
CLAUDE.md                                ← primera tarea
supabase/config.toml
supabase/migrations/*.sql                ← esquema + RLS + funciones
supabase/seed.sql                        ← rubros y plantillas iniciales
app/globals.css                          ← tokens de marca
app/(auth)/login/page.tsx
app/auth/callback/route.ts
app/(app)/layout.tsx                     ← shell + sidebar
app/(app)/leads/page.tsx                 ← dashboard
app/(app)/leads/lista/page.tsx
app/(app)/leads/[id]/page.tsx
app/(app)/leads/generar/page.tsx
app/(app)/leads/agenda/page.tsx
app/(app)/configuracion/page.tsx
app/api/apify/webhook/route.ts           ← service role, saltea RLS
app/api/jobs/reconcile/route.ts
middleware.ts                            ← refresh de sesión + protección
lib/supabase/{client,server,admin,database.types}.ts
lib/crypto.ts                            ← AES-256-GCM
lib/apify/{client,reconcile}.ts
lib/providers/{types,registry,google-maps,csv,instagram,linkedin}.ts
lib/leads/{actions,queries,dedupe,goals}.ts
components/ui/*
```

---

## Verificación

**Local**

1. `supabase start` → `npm run db:migrate` → `npm run db:types` → `npm run dev`
2. Login con Google; confirmar que `/leads` sin sesión redirige a `/login`
3. **Probar RLS de verdad:** crear un segundo usuario en el panel de Supabase, insertar un lead a su nombre, y confirmar desde la sesión propia que ese lead no aparece ni en la UI ni consultando la tabla directo con la anon key. Esto valida la garantía central del diseño, no alcanza con asumirla
4. Cargar la API key de Apify en `/configuracion` → "Probar conexión" en verde. Verificar en la base que el valor está cifrado, no en texto plano
5. Generar una lista de Google Maps con **`maxResults = 5`** (deja el costo en centavos) sobre un rubro y ciudad conocidos. Como el webhook no llega a `localhost`, confirmar que el chequeo al abrir la pantalla importa igual los resultados
6. Volver a generar la **misma** búsqueda: el conteo de leads no debe duplicarse — valida el `dedupe_key`
7. Importar un CSV con un teléfono repetido de esa lista: tiene que fusionarse, no duplicar
8. Recorrer un lead de `NUEVO` a `CERRADO_GANADO`; verificar que el timeline registró cada cambio solo
9. Agendar una reunión desde la ficha y verla en `/leads/agenda`
10. Cruzar los números del dashboard contra una consulta SQL directa en el editor de Supabase

**Producción**

11. Desplegar en Vercel con las variables cargadas; agregar la URL de producción a las redirect URLs de Supabase Auth y a los orígenes autorizados de Google OAuth
12. Repetir el paso 5 en producción — acá sí tiene que entrar por **webhook**: cerrar la pestaña mientras corre y confirmar que al volver los leads ya están importados, y que Realtime actualizó el estado del job en vivo
13. Probar el webhook con un secreto inválido: debe responder 401 y no importar nada
14. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` no aparece en ningún bundle del cliente (`grep` sobre `.next/static`)
15. Revisar en celular: la lista, la ficha y la agenda tienen que ser usables en pantalla chica

**Criterio de cierre de la Fase 1:** el Gestor de Leads queda en producción y en uso diario real — generar una lista, trabajarla y cerrar un cliente sin salir de la app — antes de escribir una sola línea del Gestor de Facturación.
