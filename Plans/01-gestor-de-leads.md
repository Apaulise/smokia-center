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

## Fase 1 (continuación) — Prospección asistida por IA

> **Por qué se reabre la Fase 1.** Los §1.1–§1.5 dejaron un gestor que genera listas y registra estados. Lo que **no** resuelve es la parte cara: analizar el negocio, escribir la apertura, leer la respuesta, decidir el próximo paso y saber cuándo pedir la llamada. Eso hoy se hace a mano con ChatGPT, fuera de la app. Estos pasos lo traen adentro.
>
> Sigue siendo Fase 1 (`CLAUDE.md` §2): no se adelanta nada de Facturación ni de Marca. El objetivo diario (§1.6) sigue diferido.

La numeración **se agrega al final, nunca se inserta**: hay comentarios en el código que citan `§1.2` y `§1.4`, y correrlos rompería las referencias. Mismo criterio que `Plans/03 §3.10`.

El diseño sigue el documento *Sistema de Prospección Asistida por IA*; sus secciones se citan acá como `SPA §N`.

### Reparto de modelos

Dos motores, y el corte no es por gusto: **enriquecer es buscar y leer, analizar es decidir.**

| Tarea | Modelo | Por qué |
|---|---|---|
| Enriquecer un lead (§1.10) | `gemini-3.5-flash-lite` + `google_search` + `url_context` | Volumen, sin juicio, una vez por lead y queda cacheado en la base. Free tier |
| Analizar una respuesta (§1.12) | `claude-opus-5`, `effort: high` | Es la decisión que mueve el CRM. Equivocarse cuesta un cliente |
| Apertura, próximo mensaje, follow-up | `claude-opus-5` | Escriben con toda la memoria del lead delante |
| Reescrituras de tono (§1.15) | `claude-sonnet-5` | Transformar un texto que ya existe no es decidir qué decir |

Es el mismo criterio que `Plans/03 §3.14` ya fijó para la marca: Gemini clasifica, Claude escribe. Las dos keys ya viven cifradas en `settings` (`ANTHROPIC_KEY_SETTING`, `GEMINI_KEY_SETTING`) — **no hace falta ninguna variable de entorno nueva**.

### 1.7 El prompt canónico de prospección

> **Estado (2026-09-25): implementado, verificación manual PENDIENTE.** `npm run typecheck` y `npm run lint` limpios (los dos errores de lint que quedan son de `components/shell/sidebar.tsx`, previos a este paso).

`Awareness_AI_Sistema_de_Prospeccion.md`, en la raíz del repo, al lado del manual de marca y del Sistema de Contenido.

**El archivo es el prompt, no un documento sobre el prompt.** Todo lo que se escriba ahí se le manda al modelo en cada llamada. Sin notas al margen, sin TODOs, sin comentarios de implementación. El `SPA §28` es su esqueleto, pero se escribe completo: el rol, qué cuenta como dolor real, la separación hecho / inferencia / hipótesis, una pregunta por mensaje (`SPA §14`), cuándo presentarse (`SPA §15`), cuándo pedir la reunión (`SPA §16`), y qué nunca decir.

`lib/leads/ai/sales-os.ts` lo lee del disco **una vez por proceso** y lo cachea a nivel de módulo — espejo exacto de `lib/brand/ai/content-os.ts`.

> **Ningún `import` ata el archivo al bundle**, así que el trace de salida de Next no lo incluye solo y en producción el `readFileSync` tiraría `ENOENT`. Hay que sumarlo a `outputFileTracingIncludes` en `next.config.ts`, que hoy ya declara el Sistema de Contenido. Es un error que **no aparece en local**.

**El perfil del vendedor va aparte, y esa es la decisión de diseño del paso.** El `SPA §28` es explícito: el modelo no puede afirmar experiencia, clientes ni resultados que no estén guardados. Hoy hay un solo caso real —una barbería—, y mañana hay tres. Si eso vive dentro del prompt cacheado, cada caso nuevo invalida el caché y reescribe un archivo que no debería moverse.

Entonces: una fila en `settings` (`sales_profile`, **sin cifrar** — no es un secreto) editable desde `/configuracion`, que se inyecta en el bloque de estado del turno. Mismo reparto que `Plans/03 §3.10`:

| Bloque | Dónde va | ¿Cachea? |
|---|---|---|
| El Sistema de Prospección completo | `system`, con `cache_control: { type: "ephemeral" }` | **Sí** — idéntico byte a byte |
| Perfil del vendedor, estado del lead, memoria, conteo de ángulos | mensaje `{ role: "system" }` **dentro de `messages`**, después del turno del usuario | No hace falta |
| La pregunta o la respuesta a analizar | el turno del usuario | — |

> **Un system prompt no es documentación.** Todo lo computable —un promedio, un conteo de ángulos, una fecha— va en los datos del turno, no en el prompt. Cada línea de más compite por atención con las que importan.

**Decisiones de implementación** que el plan no fijaba:

- **El perfil se guarda cifrado**, no en texto plano como decía el plan. La columna de `settings` se llama `value_encrypted`; escribirle texto claro sería una trampa para el próximo que la lea, y cifrar cuatro mil caracteres no cuesta nada. `getSalesProfile()` lo devuelve descifrado y **sin enmascarar** — a diferencia de las keys, el usuario tiene que poder releerlo y editarlo.
- **Guardar el campo vacío borra la fila** en vez de guardar `""`. Es la forma explícita de decirle al copiloto que no afirme ninguna experiencia, y deja la tabla sin filas fantasma.
- **Tope de 4000 caracteres**, por el turno del modelo y no por la base: esto viaja en cada mensaje.
- **El mínimo cacheable no es problema.** El doc quedó en ~14 KB (≈3.700 tokens) contra los ~20 KB del Sistema de Contenido. `Plans/03 §3.10` advierte que por debajo de 4.096 tokens el caché se cae en silencio, pero ese mínimo es el de Opus 4.6/4.5 y Haiku 4.5: **en `claude-opus-5` el mínimo es 512 tokens** y en `claude-sonnet-5`, 1.024. Los dos modelos que usa este módulo cachean holgado.

**Verificación manual** (`CLAUDE.md` §13, ítem por ítem):

1. Abrir `/configuracion`: aparece la tarjeta **Perfil del vendedor** entre "Google AI Studio (Gemini)" y "Actores de Apify", sin romper el resto de la pantalla.
2. Escribir un perfil y guardar → "Perfil guardado.". Recargar la página: el texto sigue ahí.
3. En el editor de Supabase, tabla `settings`, fila `key = 'sales_profile'`: `value_encrypted` tiene que estar **ilegible**, no el texto que escribiste.
4. Vaciar el campo y guardar → "Perfil vacío. El copiloto no va a afirmar experiencia.", y la fila desaparece de `settings`.
5. Pegar más de 4000 caracteres y guardar → error "El perfil no puede pasar de 4000 caracteres.", y no se guarda nada.
6. Leer `Awareness_AI_Sistema_de_Prospeccion.md` de punta a punta: ninguna sección quedó cortada, y no hay adentro ningún TODO, nota al margen ni comentario de implementación. **El archivo es el prompt**, así que todo lo que esté ahí se le manda al modelo.
7. ⚠ **Diferido a §1.11.** Que `getSalesOS()` no tire `ENOENT` en producción sólo se puede comprobar cuando exista una pantalla que lo llame. Hasta entonces `outputFileTracingIncludes` queda declarado pero sin probar, y este ítem se arrastra al checklist de §1.11.

### 1.8 El pipeline de 17 estados

El `SPA §17` pide 16 estados donde hoy hay 8. **Seis de los ocho actuales sobreviven con el mismo nombre; sólo `AGENDADO` se renombra.** Los valores van en español, como `job_status` y `appointment_status`: `CLAUDE.md` §7 pone la frontera del idioma en la pantalla, pero los enums de este proyecto ya están en español y mezclar sería peor que la regla.

| `SPA §17` | Enum | |
|---|---|---|
| SCRAPED | `NUEVO` | se conserva — evita migrar el `default` |
| CONTACT_READY | `LISTO` | enriquecido, con apertura lista |
| CONTACTED | `CONTACTADO` | se conserva |
| AUTO_REPLY | `AUTORESPUESTA` | **nunca cuenta como respuesta humana** |
| HUMAN_REPLY | `RESPONDIO` | se conserva |
| DISCOVERY | `DIAGNOSTICO` | |
| QUALIFIED | `CALIFICADO` | |
| INTERESTED | `INTERESADO` | |
| MEETING_PROPOSED | `REUNION_PROPUESTA` | |
| MEETING_BOOKED | `REUNION_AGENDADA` | **migra desde `AGENDADO`** |
| MEETING_COMPLETED | `REUNION_REALIZADA` | |
| PROPOSAL | `PROPUESTA_ENVIADA` | se conserva |
| WON | `CERRADO_GANADO` | se conserva |
| NOT_NOW | `AHORA_NO` | `SPA §18` — **no es** `CERRADO_PERDIDO` |
| FOLLOW_UP | `SEGUIMIENTO` | |
| LOST | `CERRADO_PERDIDO` | se conserva |
| — | `DESCARTADO` | se conserva; es el `DISQUALIFY` del `SPA §13` |

**El orden de declaración importa**, y no es cosmético: `leads_funnel_by_status()` usa `unnest(enum_range(...)) with ordinality`, así que el orden del enum *es* el orden del embudo. Por eso no alcanza con `ALTER TYPE ... ADD VALUE`: hay que recrear el tipo.

La migración, en este orden exacto y en un solo archivo:

1. `drop function public.leads_funnel_by_status()` — devuelve `lead_status` en su `RETURNS`, así que **crea una dependencia real** y sin esto el `drop type` falla.
2. `create type lead_status_new as enum (...)` con los 17 valores en orden de pipeline.
3. `alter table public.leads alter column status drop default` — un default no se puede castear.
4. Castear las tres columnas (`leads.status`, `lead_activities.from_status`, `lead_activities.to_status`) con `using (case status::text when 'AGENDADO' then 'REUNION_AGENDADA' else status::text end)::lead_status_new`.
5. `drop type lead_status` + `alter type lead_status_new rename to lead_status`.
6. `set default 'NUEVO'`.
7. **Recrear `leads_dashboard_summary()`.** Su cuerpo tiene `status = 'AGENDADO'` como literal. Es `language sql`, así que Postgres **no registra la dependencia**: el `drop type` pasa sin protestar y la función se rompe recién en runtime. Pasa a contar las tres etapas de reunión.
8. Recrear `leads_funnel_by_status()` igual que estaba.
9. `npm run db:types`.

> **Esto corre contra la base real.** No hay Supabase local (`CLAUDE.md` §8), así que antes va `npm run db:diff`, y conviene confirmar que los estados que hay en la base son sólo los del enum viejo — el `case` del `using` se come en silencio cualquier valor inesperado.

Del lado del código, `lib/leads/status.ts` suma dos cosas además de los 17 valores:

- **`STAGE_GROUP`** — 17 columnas de Kanban son inusables. El Kanban agrupa en 6 (Sin contactar · Contactado · En conversación · Calificado · Reunión · Cierre); los `<select>` de la tabla y de la ficha siguen mostrando los 17. El estado fino es para el modelo y las métricas; el grueso es para arrastrar tarjetas.
- **`lib/leads/stage-engine.ts`** — el `CRMStateEngine` del `SPA §30`. Dadas las señales de un análisis (`response_type`, `interest_level`, `pain_confirmed`) devuelve el estado que corresponde. **Nunca retrocede el pipeline por su cuenta**, y el humano puede seguir forzando cualquier estado a mano, como hoy. Una IA que mueve un lead a `CERRADO_PERDIDO` sola es una IA que borra trabajo.

### 1.9 Esquema de datos del copiloto

Cuatro tablas y cuatro enums nuevos. Todo con `owner_id`, RLS y las cuatro políticas — sumar los nombres al array del loop `DO $do$` de la migración inicial es todo lo que hace falta (`CLAUDE.md` §10).

| Tabla | Cardinalidad | Qué guarda |
|---|---|---|
| `lead_intel` | 1:1 con `leads` | Enriquecimiento (`SPA §4`), memoria del lead (`SPA §25`), próxima acción (`SPA §13`) |
| `lead_messages` | N por lead | La conversación (`SPA §7`) |
| `lead_signals` | N por lead | Dolores, objeciones y señales de compra (`SPA §11`) |
| `sales_knowledge` | global del usuario | Memoria global de ventas (`SPA §26`) |

Enums: `lead_message_sender` (`VENDEDOR | LEAD`), `lead_signal_kind` (`DOLOR | OBJECION | SENAL_COMPRA`), `lead_signal_status` (`HIPOTESIS | SOSPECHADO | CONFIRMADO`) y `lead_sales_angle` con los nueve códigos del `SPA §6`.

Dos columnas nuevas en `leads`: `interest_level smallint check (interest_level between 0 and 10)` y `sales_angle lead_sales_angle`. Van en `leads` y no en `lead_intel` para que la tabla y el Kanban puedan ordenar y filtrar sin un join — `listLeads` ya pagina del lado del servidor y meterle un join por fila sería pagarlo en cada pantalla. `next_action_at`, que ya existe, pasa a ser también la `follow_up_date` del `SPA §18`.

**La temperatura no es una columna.** Frío / Tibio / Caliente / Muy caliente (`SPA §10`) se deriva de `interest_level` en TypeScript. Un valor derivado que se persiste es un valor que tarde o temprano queda desincronizado del que lo origina.

`alter type message_channel add value 'INSTAGRAM'` va en **su propio archivo de migración**: un `ADD VALUE` no se puede usar en la misma transacción en que se declara.

`lead_messages` lleva `angle` y `variant` desde el día 1, aunque §1.19 las use recién al final. Agregarlas después significaría no poder comparar nada de lo ya mandado, que es justamente lo que el `SPA §27` quiere medir.

`sales_knowledge` copia de `brand_knowledge` las tres decisiones que lo hacen funcionar, porque ya se pagaron una vez:

- **`origin` obligatorio** (`PROPIO | MERCADO | HIPOTESIS`), para que el modelo no lave una conjetura y la lea como hecho tres semanas después
- **`search` como columna generada** `tsvector`, no un índice sobre expresión: PostgREST sólo filtra por columnas, así que `.textSearch()` de `supabase-js` necesita la columna
- **ninguna herramienta de borrado** para el modelo; borrar es una decisión de pantalla

### 1.10 Enriquecimiento del lead

`lib/leads/ai/enrich.ts`. Convierte un lead scrapeado en el análisis comercial del `SPA §4`: `business_summary`, `detected_services`, `possible_decision_maker`, `operation_signals`, `technology_signals`, `possible_pains`, `recommended_sales_angle`, `confidence`.

**Son dos pases contra Gemini, y la razón es concreta:**

> **`google_search` y `responseSchema` no conviven.** Gemini desactiva el grounding **en silencio** cuando se le pide salida JSON en la misma llamada — el issue `google-gemini/cookbook#1274` lo mide en `gemini-3.5-flash`: 0 de 5 respuestas fundamentadas pidiendo JSON, 5 de 5 pidiendo prosa. No tira error. Devuelve un objeto perfectamente plausible sin haber buscado nada, que es el peor resultado posible.

- **Pase A — evidencia.** `google_search` + `url_context`, con `website`, `instagram_url` y `source_url` del lead. Salida en prosa. Junta qué hace el negocio, qué servicios ofrece, cómo se reserva un turno y qué se ve de su operación.
- **Pase B — estructura.** Sin herramientas, con `responseSchema`, sobre el texto del pase A. Devuelve el objeto.

La salida se valida con Zod (`CLAUDE.md` §5) y el `recommended_sales_angle` se filtra contra los nueve códigos válidos: un ángulo inventado se descarta, no se guarda. Mismo criterio que `relevance.ts` con los ids que no estaban en el batch.

**Hecho / inferencia / hipótesis** es la regla central del pase B. El ejemplo del `SPA §4` es el estándar: *"la web tiene botón de reserva por WhatsApp"* es un hecho; *"parte del seguimiento podría ser manual"* es una hipótesis; *"hacen todo manualmente"* es una invención y no se escribe. Por eso cada `possible_pain` nace en `lead_signals` con `status = 'HIPOTESIS'`: **el enriquecimiento no confirma dolores, nunca.** Sólo una cita textual del lead lo hace (§1.13).

Al terminar escribe `lead_intel.enrichment`, `leads.sales_angle`, y mueve `NUEVO → LISTO`.

**Los límites del free tier son reales**: ~15 RPM y 1.500 RPD en flash-lite, y el grounding tiene su propia cuota diaria, más chica. Entonces un botón **"Enriquecer"** por lead en la ficha y un **"Enriquecer lista"** con tope duro (`ENRICH_BATCH_MAX = 25`) y throttle entre llamadas. **Nunca automático al importar**: una lista de 500 leads quemaría la cuota del día en el primer minuto. Si Gemini falla, el lead queda sin enriquecer y se reintenta — la importación no se rompe.

### 1.11 Biblioteca de ángulos y generador de apertura

> **Estado (2026-09-26): en curso.** `angles.ts`, `schemas.ts` (Opening/Analyze/Rewrite/FollowUp) y `prompts.ts` (bloque de estado + bloque de ángulo) ya están. Falta: `opening.ts` (`chooseSalesAngle` + `generateOpening`), sumar la Server Action a `lib/leads/ai/actions.ts`, la migración de `lead_angle_counts_30d()` (ya aplicada), y la UI de la ficha. §1.8 y §1.9 y §1.10 están completos (migraciones aplicadas, `npm run typecheck`/`lint` limpios salvo los dos errores previos de `components/shell/sidebar.tsx`) — retomar desde acá.

`lib/leads/ai/angles.ts` — los nueve ángulos del `SPA §6` con su regla de uso, **en TypeScript, no en el prompt**. El modelo recibe el ángulo ya elegido y el porqué, no la tabla entera para que elija. Una tabla de nueve opciones en el prompt es nueve veces la oportunidad de elegir la cómoda.

`lib/leads/ai/opening.ts` — `generateOpening()`. Opus 5, salida estructurada con `zodOutputFormat`, el Sistema de Prospección en `system` con `cache_control: ephemeral`, y el estado en un mensaje `{ role: "system" }` después del turno del usuario.

- **El objetivo del primer mensaje es obtener información, no vender.** El prompt lo dice y el esquema lo fuerza: el output lleva `objective` y `question`, y una apertura sin pregunta no valida. El `SPA §5` prohíbe además arrancar con "Somos una agencia de IA" o cualquier variante.
- **Antisesgo de ángulo** (`SPA §6`, *"evitar usar siempre el mismo"*): se le pasa el conteo de aperturas por ángulo de los últimos 30 días, **calculado en SQL**. El modelo no hace aritmética — es la regla que `lib/brand/insights/` ya impone en todo el proyecto.
- Se guarda como `lead_messages` con `sender = 'VENDEDOR'`, `generated_by = 'IA'`, `angle` y `variant`. **No se marca como enviado hasta que el usuario confirma**: el envío es un acto humano y el `SPA §24` no admite matices ahí.

### 1.12 Conversación y analizador de respuestas

`lib/leads/ai/analyze.ts` — `analyzeLeadResponse()`, el corazón del sistema. Opus 5, `effort: "high"`, salida estructurada con exactamente la forma del `SPA §29`: `analysis` / `crm_update` / `strategy` / `suggested_reply`.

La interfaz es la del `SPA §23`: un campo *"Pegá la respuesta del lead"* y un botón **Analizar**. Pegar es lo correcto, no una limitación — la integración de WhatsApp es `SPA §33`, explícitamente segunda etapa.

Una corrida escribe, en una sola server action:

1. El `lead_messages` entrante (`sender = 'LEAD'`) con el `analysis jsonb` colgado de su propia fila
2. `leads.interest_level` y el estado que devuelve el `CRMStateEngine`
3. Las `lead_signals` nuevas o actualizadas (§1.13)
4. `lead_intel.memory` reescrita (§1.14)
5. Un `lead_activities` de `CAMBIO_ESTADO` si el estado se movió — **el timeline existente sigue siendo la fuente de verdad de la ficha**, no se lo reemplaza por la conversación

**`AUTORESPUESTA` no es una respuesta**, y esa distinción es lo que hace que la tasa de respuesta signifique algo. El `response_type` la separa y las métricas del §1.17 la excluyen del numerador de respuesta humana. Un "gracias por tu mensaje, te responderemos a la brevedad" que cuenta como respuesta convierte el embudo en decoración.

### 1.13 Dolores, señales y evidencia

`lib/leads/signals.ts`. Un dolor tiene ciclo de vida, y subir de escalón cuesta:

```
HIPOTESIS     el enriquecimiento lo propuso
    ↓         el lead dijo algo compatible
SOSPECHADO
    ↓         hay una cita textual
CONFIRMADO
```

**`evidence` es obligatoria para llegar a `CONFIRMADO`.** Sin cita, el `status` no sube, y el modelo no tiene forma de saltearlo porque la validación está en TypeScript. Es la misma defensa que `recommendations.ts` hace filtrando `postIds` contra los posts que existen: una conclusión sin evidencia trazable es una opinión, y vale igual aunque el modelo se equivoque de buena fe.

El ejemplo del `SPA §12` es el caso de prueba del paso. En *Definitivamente Bella*, "recordatorios a pacientes activos" **no es un dolor** —ya lo resuelven, con consentimiento, ficha técnica y recordatorio el día antes— y un sistema que lo marque como dolor está fabricando trabajo. "Consultas no convertidas sin seguimiento" **sí lo es**, y llega con la cita: *"no llegamos a hacer seguimiento debido a la cantidad de consultas"*.

Por eso `lead_signals` lleva además `business_impact`, `trigger_event` y `timing`: la apertura del segundo local no es un dolor, es el disparador que vuelve accionable uno que ya existía.

### 1.14 Memoria por lead y próxima acción

**La IA no relee el chat entero cada vez.** `lead_intel.memory` tiene la forma del `SPA §25` (`business_context`, `current_process`, `pain_points`, `objections`, `buying_signals`, `tools_used`, `key_quotes`, `timing`, `next_action`), se reescribe después de cada análisis, y es lo que viaja en el turno siguiente. Un hilo de veinte mensajes reenviado entero es caro y, peor, entierra lo importante en ruido.

`lib/leads/ai/next-action.ts` calcula la `next_best_action` del `SPA §13`: `ASK_QUESTION`, `EXPLAIN_SERVICE`, `ASK_FOR_MEETING`, `SEND_INFORMATION`, `FOLLOW_UP`, `WAIT`, `DISQUALIFY`, `CLOSE_LEAD`.

> **La condición para pedir reunión se evalúa en TypeScript, no en el prompt.** El `SPA §16` la fija: `pain_confirmed && human_response && interest_level >= 5`. Un umbral que el modelo puede reinterpretar no es un umbral. Si no se cumple, `ASK_FOR_MEETING` ni siquiera entra en el conjunto de opciones que el esquema admite.

La regla de no sobrepreguntar (`SPA §14`) se hace cumplir igual de literal: el esquema de salida admite **una** pregunta. Las cinco preguntas juntas del ejemplo no son un mensaje, son un formulario.

### 1.15 La ficha reconstruida y el copiloto lateral

`/leads/[id]` pasa a tres columnas, con la forma del `SPA §22`:

- **Cabecera** — estado · temperatura · interés · dolor confirmado · oportunidad · próxima acción recomendada
- **Conversación** al centro — `lead_messages` y `lead_activities` mezclados por tiempo en un solo hilo
- **AI COPILOT** a la derecha — qué aprendimos, dolores, objeciones, señales de compra, información faltante, mensaje recomendado

El mensaje sugerido sigue el patrón que `components/brand/planner/item-dialog.tsx` ya usa y que funcionó: **la server action devuelve el texto y no persiste nada**, el campo queda editable, y recién al confirmar se guarda. Que se lea, se corrija, y recién ahí se guarde.

Botones del `SPA §24`: `COPIAR`, `EDITAR`, `REGENERAR`, `MÁS CORTO`, `MÁS INFORMAL`, `MÁS DIRECTO`. Las tres reescrituras van con `claude-sonnet-5`.

Se reusan `components/ui/*`, `lead-timeline.tsx` (extendido para renderizar mensajes además de actividades), `resolveTemplate` y `buildWhatsappLink` de `lib/leads/templates.ts` para copiar y abrir WhatsApp en un paso, y `components/brand/markdown.tsx`.

### 1.16 Seguimiento futuro

`AHORA_NO` es el estado que más plata deja sobre la mesa si se trata mal. El `SPA §18` es terminante: *"no ahora porque estoy abriendo otro local, escribime en un mes"* **no es** `CERRADO_PERDIDO`.

Se guarda con `next_action_at`, la razón, y la oportunidad que quedó identificada. Cuando llega la fecha el lead aparece en el panel de atención del dashboard — `listStaleLeads` ya existe y se extiende.

`generateFollowup()` escribe **desde el contexto histórico**, no desde una plantilla. El prompt tiene prohibido "Hola, quería hacer seguimiento", y la regla que lo hace cumplible es dura: si no puede citar algo concreto de la conversación anterior, **no genera nada y lo dice**. Un follow-up genérico gasta el único intento que quedaba.

### 1.17 Métricas de prospección

RPC nueva `leads_prospecting_funnel()`, SQL, `SECURITY INVOKER` como las cinco que ya existen. Devuelve los siete escalones del `SPA §21` y las tasas del `SPA §20`.

**Todo se calcula en SQL, nada se le pide al modelo.** `contacts_sent` = mensajes salientes que son el primero de su lead; `human_responses` = leads con al menos un entrante cuyo `analysis->>'response_type'` no es autorespuesta; `qualified`, `interested` y `meetings` salen del estado.

La tasa de respuesta **total** se muestra pero va marcada como no evaluativa, tal como pide el `SPA §20`: mezcla autorespuestas y sirve para saber si los mensajes llegan, no para saber si son buenos. La que importa es la humana.

El embudo se dibuja con la skill `dataviz` (`CLAUDE.md` §12) y la paleta de marca, extendiendo `components/leads/dashboard/leads-funnel.tsx`.

### 1.18 Memoria global de ventas

`sales_knowledge` más tres herramientas para el modelo — `buscar_conocimiento`, `guardar_conocimiento`, `actualizar_conocimiento` — calcadas de `lib/brand/ai/tools.ts` con sus mismos topes: preview del `body` a 1.500 caracteres y máximo 15 notas por resultado, porque 15 notas largas son ~30k tokens en un solo `tool_result`. **Sin herramienta de borrado.**

Colecciones: `OBJECIONES`, `DOLORES`, `ANGULOS`, `SEGMENTOS`, `MENSAJES`, `APRENDIZAJES`.

Pantalla `/leads/conocimiento`, reusando la grilla de la biblioteca de marca. No es opcional: **una memoria que sólo el modelo puede leer es una caja negra**, y el día que empiece a repetir una conclusión equivocada no habría dónde ir a corregirla.

### 1.19 Experimentación de aperturas

Sin tabla nueva: `angle` y `variant` ya están en `lead_messages` desde §1.9. Una RPC agrupa por ángulo y variante y devuelve tasa de respuesta humana, de calificación y de agenda — lo que el `SPA §27` quiere poder comparar.

> **Con 184 contactos repartidos en nueve ángulos, ninguna diferencia es significativa.** La pantalla muestra el `n` al lado de cada porcentaje y no declara ganadores por debajo de `ANGLE_MIN_SAMPLE = 20`. Es la misma regla que `Plans/03 §3.11` fijó con `SIN_BASELINE`: clasificar contra tres datos es fabricar evidencia, y fabricar evidencia sobre qué mensaje funciona es peor que no medir.

### Lo que estos pasos no hacen

Queda explícitamente afuera, y es la segunda etapa del `SPA §33`: envío automático, API de WhatsApp, sincronización de conversaciones, integración de calendario, agentes autónomos y lead scoring predictivo. También queda afuera un chat libre con el copiloto — el `SPA §22` pide un panel que **renderiza** la memoria, no una conversación paralela a la del lead.

Primero hay que validar que el copiloto tome buenas decisiones. Automatizar un criterio que todavía no se probó es multiplicar un error.

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

Awareness_AI_Sistema_de_Prospeccion.md   ← el system prompt literal (§1.7)
next.config.ts                           ← outputFileTracingIncludes (§1.7)
app/(app)/leads/conocimiento/page.tsx    ← memoria global de ventas (§1.18)
lib/leads/status.ts                      ← 17 estados + STAGE_GROUP (§1.8)
lib/leads/stage-engine.ts                ← CRMStateEngine (§1.8)
lib/leads/signals.ts                     ← ciclo de vida de dolores (§1.13)
lib/leads/ai/sales-os.ts                 ← readFileSync cacheado (§1.7)
lib/leads/ai/angles.ts                   ← los nueve ángulos (§1.11)
lib/leads/ai/enrich.ts                   ← Gemini, dos pases (§1.10)
lib/leads/ai/opening.ts                  ← Opus 5, apertura (§1.11)
lib/leads/ai/analyze.ts                  ← Opus 5, el analizador (§1.12)
lib/leads/ai/next-action.ts              ← próxima acción y condición de reunión (§1.14)
lib/leads/ai/rewrite.ts                  ← Sonnet 5, reescrituras de tono (§1.15)
lib/leads/ai/{prompts,schemas}.ts        ← composición y Zod de salida
lib/leads/knowledge/*                    ← calco de lib/brand/knowledge/ (§1.18)
components/leads/copilot/*               ← panel lateral y analizar-respuesta (§1.15)
components/leads/conversation/*          ← hilo de mensajes (§1.15)
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
