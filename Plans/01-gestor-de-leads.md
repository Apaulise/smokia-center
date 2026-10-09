# SmokIA — Panel de negocio

## Context

Hoy el directorio del proyecto sólo contiene `SmokIA_Manual_de_Marca.md`. No hay código.

El objetivo es construir el panel central de SmokIA con la estructura del diagrama: un **Panel principal** que da acceso a las tres patas del negocio — **Gestor de Leads**, **Gestor de Facturación** y **Gestor de Marca Personal**.

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

1. **Qué es SmokIA** — el negocio y las tres patas del diagrama
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
6. **Marca** — tabla de tokens, tipografías, y la convención *cyan = acción/resultado, violeta = proceso/innovación*; referencia a `SmokIA_Manual_de_Marca.md`
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

> **Reabierto en §1.22 (2026-09-30)**, con el ticket promedio cargado a mano en vez de la facturación real. `lib/leads/goals.ts` recién se creó ahí — el stub que este paso prometía nunca había existido.

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

`SmokIA_Sistema_de_Prospeccion.md`, en la raíz del repo, al lado del manual de marca y del Sistema de Contenido.

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
6. Leer `SmokIA_Sistema_de_Prospeccion.md` de punta a punta: ninguna sección quedó cortada, y no hay adentro ningún TODO, nota al margen ni comentario de implementación. **El archivo es el prompt**, así que todo lo que esté ahí se le manda al modelo.
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

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE.** `angles.ts`, `schemas.ts`, `prompts.ts`, `opening.ts` (`chooseSalesAngle` + `generateOpening`), las Server Actions (`generateLeadOpening` / `confirmLeadOpening` en `lib/leads/ai/actions.ts`) y el panel de la ficha (`components/leads/opening-panel.tsx`) ya están. `npm run typecheck`/`lint` limpios salvo los dos errores previos de `components/shell/sidebar.tsx`.
>
> **Decisión de implementación que el plan no fijaba — variante.** El plan dejaba `angle` y `variant` en `lead_messages` desde §1.9 pero no decía qué es una "variante": acá se definieron tres encuadres fijos para el primer mensaje (observación visible / duda genuina / observación de rubro, ver `VARIANT_HINT` en `opening.ts`), balanceados con el mismo criterio que el ángulo (el menos usado para ese ángulo en 30 días, calculado sin una consulta nueva: `count % 3`). Es lo que hace comparable §1.19 entre leads distintos. Revisar si el encuadre de cada variante tiene sentido antes de acumular datos con ellos.

`lib/leads/ai/angles.ts` — los nueve ángulos del `SPA §6` con su regla de uso, **en TypeScript, no en el prompt**. El modelo recibe el ángulo ya elegido y el porqué, no la tabla entera para que elija. Una tabla de nueve opciones en el prompt es nueve veces la oportunidad de elegir la cómoda.

`lib/leads/ai/opening.ts` — `generateOpening()`. Opus 5, salida estructurada con `zodOutputFormat`, el Sistema de Prospección en `system` con `cache_control: ephemeral`, y el estado en un mensaje `{ role: "system" }` después del turno del usuario.

- **El objetivo del primer mensaje es obtener información, no vender.** El prompt lo dice y el esquema lo fuerza: el output lleva `objective` y `question`, y una apertura sin pregunta no valida. El `SPA §5` prohíbe además arrancar con "Somos una agencia de IA" o cualquier variante.
- **Antisesgo de ángulo** (`SPA §6`, *"evitar usar siempre el mismo"*): se le pasa el conteo de aperturas por ángulo de los últimos 30 días, **calculado en SQL**. El modelo no hace aritmética — es la regla que `lib/brand/insights/` ya impone en todo el proyecto.
- Se guarda como `lead_messages` con `sender = 'VENDEDOR'`, `generated_by = 'IA'`, `angle` y `variant`. **No se marca como enviado hasta que el usuario confirma**: el envío es un acto humano y el `SPA §24` no admite matices ahí.

### 1.12 Conversación y analizador de respuestas

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE.** `lib/leads/ai/analyze.ts` + la Server Action `analyzeLeadResponseAction` (una sola corrida: mensaje entrante, señales, memoria, `CRMStateEngine` y próxima acción) + `components/leads/analyze-panel.tsx` en la ficha.
>
> **Decisión que el plan no fijaba.** `analyzeLeadResponse()` es una sola llamada sin herramientas, a propósito: a diferencia del chat de Marca (`lib/brand/ai/chat.ts`), acá no hay una conversación visible turno a turno donde ver qué busca o guarda el modelo — el SPA §22 pide un panel que renderiza la memoria, no un chat. Ver la nota de §1.18 sobre las tools de memoria global.

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

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE.** `lib/leads/signals.ts` (`clampSignalStatus`, `planSignalWrites`, `hasConfirmedPain`) y `components/leads/copilot/signals-list.tsx` en la ficha.
>
> **Decisión que el plan no fijaba.** El analizador no manda el id de una señal existente (el esquema de salida de §1.12 no lo tiene). `planSignalWrites` matchea por `(kind, título normalizado en minúsculas)`: sin match inserta una fila nueva — más seguro un duplicado ocasional que pisar la señal equivocada. El estado nunca retrocede (mismo criterio que el `CRMStateEngine`).

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

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE.** `lib/leads/ai/memory.ts` (`rebuildLeadMemory`) y `lib/leads/ai/next-action.ts` (`computeNextBestAction`), los dos integrados en `analyzeLeadResponseAction`.
>
> **Decisiones que el plan no fijaba.** (1) `lead_intel.memory` se recalcula en TypeScript puro a partir de `lead_signals` y la salida del analizador — no hay una llamada al modelo dedicada a esto; no está en la tabla "Reparto de modelos" de §1.7. (2) `next_best_action` agrega `CLOSE_LEAD` cuando el interés llega a 9/10 con dolor confirmado (SPA §11: "quiere una llamada o una propuesta"), más allá de las tres condiciones literales de `ASK_FOR_MEETING`. (3) `SEND_INFORMATION` nunca lo elige el motor solo — queda como opción manual en la ficha, no automatizada.

**La IA no relee el chat entero cada vez.** `lead_intel.memory` tiene la forma del `SPA §25` (`business_context`, `current_process`, `pain_points`, `objections`, `buying_signals`, `tools_used`, `key_quotes`, `timing`, `next_action`), se reescribe después de cada análisis, y es lo que viaja en el turno siguiente. Un hilo de veinte mensajes reenviado entero es caro y, peor, entierra lo importante en ruido.

`lib/leads/ai/next-action.ts` calcula la `next_best_action` del `SPA §13`: `ASK_QUESTION`, `EXPLAIN_SERVICE`, `ASK_FOR_MEETING`, `SEND_INFORMATION`, `FOLLOW_UP`, `WAIT`, `DISQUALIFY`, `CLOSE_LEAD`.

> **La condición para pedir reunión se evalúa en TypeScript, no en el prompt.** El `SPA §16` la fija: `pain_confirmed && human_response && interest_level >= 5`. Un umbral que el modelo puede reinterpretar no es un umbral. Si no se cumple, `ASK_FOR_MEETING` ni siquiera entra en el conjunto de opciones que el esquema admite.

La regla de no sobrepreguntar (`SPA §14`) se hace cumplir igual de literal: el esquema de salida admite **una** pregunta. Las cinco preguntas juntas del ejemplo no son un mensaje, son un formulario.

### 1.15 La ficha reconstruida y el copiloto lateral

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE — es el paso más grande para probar a mano.** `lib/leads/temperature.ts`, `lib/leads/conversation.ts` + `components/leads/conversation/message-thread.tsx` (reemplaza a `lead-timeline.tsx`, borrado), `components/leads/copilot/{signals-list,status-summary,save-signal-button}.tsx`, `lib/leads/ai/rewrite.ts` + `components/leads/rewrite-buttons.tsx` + `components/leads/suggested-reply-confirm.tsx`, y la página `app/(app)/leads/[id]/page.tsx` reescrita entera.
>
> **Decisión que el plan no fijaba: dónde van los datos de contacto, rubro/origen, agenda y notas.** El `SPA §22` describe cabecera + conversación al centro + copiloto a la derecha, pero no dice dónde queda lo que ya existía de §1.3/§1.5. Quedaron en una columna angosta a la izquierda (`lg:grid-cols-12`: 3/6/3). Revisar si esa proporción funciona en la práctica, sobre todo en pantallas chicas (`CLAUDE.md` verificación #15).
>
> **Bug real encontrado y corregido en este paso:** `rewrite-buttons.tsx` (cliente) importaba `REWRITE_TONES`/`RewriteTone` directo de `lib/leads/ai/rewrite.ts`, que arrastra `sales-os.ts` (`readFileSync`) al bundle del navegador — `npm run build` lo detectó (`Module not found: Can't resolve 'fs'`). Se separaron los tonos a `lib/leads/ai/rewrite-tones.ts`, sin dependencias de servidor. **`npm run typecheck` no lo detecta, sólo `npm run build`** — vale la pena correr build antes de dar por cerrado cualquier paso que agregue un componente cliente nuevo.

`/leads/[id]` pasa a tres columnas, con la forma del `SPA §22`:

- **Cabecera** — estado · temperatura · interés · dolor confirmado · oportunidad · próxima acción recomendada
- **Conversación** al centro — `lead_messages` y `lead_activities` mezclados por tiempo en un solo hilo
- **AI COPILOT** a la derecha — qué aprendimos, dolores, objeciones, señales de compra, información faltante, mensaje recomendado

El mensaje sugerido sigue el patrón que `components/brand/planner/item-dialog.tsx` ya usa y que funcionó: **la server action devuelve el texto y no persiste nada**, el campo queda editable, y recién al confirmar se guarda. Que se lea, se corrija, y recién ahí se guarde.

Botones del `SPA §24`: `COPIAR`, `EDITAR`, `REGENERAR`, `MÁS CORTO`, `MÁS INFORMAL`, `MÁS DIRECTO`. Las tres reescrituras van con `claude-sonnet-5`.

Se reusan `components/ui/*`, `lead-timeline.tsx` (extendido para renderizar mensajes además de actividades), `resolveTemplate` y `buildWhatsappLink` de `lib/leads/templates.ts` para copiar y abrir WhatsApp en un paso, y `components/brand/markdown.tsx`.

### 1.16 Seguimiento futuro

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE.** `lib/leads/ai/follow-up.ts` (`generateFollowup`), la Server Action `generateLeadFollowup` y `components/leads/follow-up-panel.tsx` en la ficha. `listStaleLeads` (§1.4) se extendió con la condición `next_action_at.lte.now()` y el panel de atención distingue "seguimiento vencido" de "sin tocar".

`AHORA_NO` es el estado que más plata deja sobre la mesa si se trata mal. El `SPA §18` es terminante: *"no ahora porque estoy abriendo otro local, escribime en un mes"* **no es** `CERRADO_PERDIDO`.

Se guarda con `next_action_at`, la razón, y la oportunidad que quedó identificada. Cuando llega la fecha el lead aparece en el panel de atención del dashboard — `listStaleLeads` ya existe y se extiende.

`generateFollowup()` escribe **desde el contexto histórico**, no desde una plantilla. El prompt tiene prohibido "Hola, quería hacer seguimiento", y la regla que lo hace cumplible es dura: si no puede citar algo concreto de la conversación anterior, **no genera nada y lo dice**. Un follow-up genérico gasta el único intento que quedaba.

### 1.17 Métricas de prospección

> **Estado (2026-09-26): implementado y desplegado, verificación manual PENDIENTE.** Migración `20260926160000_leads_prospecting_funnel.sql` (aplicada con `db push`, tipos regenerados), `lib/leads/prospecting-rates.ts` y `components/leads/dashboard/prospecting-funnel.tsx` en `/leads`.
>
> **Decisión que el plan no fijaba: los siete escalones exactos.** El `SPA §21` no está en el archivo del prompt (llega hasta §21 "Regla final" — ver la nota de §1.7 sobre qué es y qué no es el archivo). Se interpretaron como: leads totales, contactados, respuestas humanas, calificados, interesados, con reunión y cerrados ganados — leyendo literalmente la lista de fórmulas que sí da este mismo `§1.17` del plan. Revisar que sea la lectura correcta de "los siete escalones".

RPC nueva `leads_prospecting_funnel()`, SQL, `SECURITY INVOKER` como las cinco que ya existen. Devuelve los siete escalones del `SPA §21` y las tasas del `SPA §20`.

**Todo se calcula en SQL, nada se le pide al modelo.** `contacts_sent` = mensajes salientes que son el primero de su lead; `human_responses` = leads con al menos un entrante cuyo `analysis->>'response_type'` no es autorespuesta; `qualified`, `interested` y `meetings` salen del estado.

La tasa de respuesta **total** se muestra pero va marcada como no evaluativa, tal como pide el `SPA §20`: mezcla autorespuestas y sirve para saber si los mensajes llegan, no para saber si son buenos. La que importa es la humana.

El embudo se dibuja con la skill `dataviz` (`CLAUDE.md` §12) y la paleta de marca, extendiendo `components/leads/dashboard/leads-funnel.tsx`.

### 1.18 Memoria global de ventas

> **Estado (2026-09-26): implementado, verificación manual PENDIENTE.** `lib/leads/knowledge/{schema,queries,mutations,actions}.ts`, `lib/leads/ai/tools.ts` (las tres tools), `components/leads/knowledge/{knowledge-list,knowledge-dialog}.tsx` y `app/(app)/leads/conocimiento/page.tsx`, agregada al sidebar (`components/shell/nav.ts`). `components/leads/copilot/save-signal-button.tsx` deja "Guardar en memoria global" desde una señal confirmada de la ficha.
>
> **Decisión de implementación que el plan no fijaba — y la más importante para revisar de este paso.** Las tres tools (`buscar_conocimiento`, `guardar_conocimiento`, `actualizar_conocimiento`) están escritas en `lib/leads/ai/tools.ts` pero **no están conectadas a ninguna llamada todavía**. `analyzeLeadResponse()` (§1.12) es una sola corrida de salida estructurada sin conversación visible — conectar tool-use ahí significaría que el modelo busca y escribe en la memoria global sin que la persona vea qué hizo, a diferencia del chat de Marca donde el tool-use se ve en pantalla turno a turno. Mientras tanto, la escritura a memoria global es 100% humana: manual desde `/leads/conocimiento`, o con un clic desde una señal confirmada en la ficha, prellenada mecánicamente (no por el modelo). Si preferís que el modelo escriba solo ahí (como en Marca), hay que decidir dónde vive esa conversación visible antes de conectarlo.
>
> **2026-10-08:** `lib/leads/ai/tools.ts` se borró en la auditoría — estaba tipado sobre el SDK de Anthropic, que salió del proyecto, y nadie lo importaba. Si se decide conectar tools, se reescribe para Groq/Gemini (la lógica de las tres tools queda en el historial de git).

`sales_knowledge` más tres herramientas para el modelo — `buscar_conocimiento`, `guardar_conocimiento`, `actualizar_conocimiento` — calcadas de `lib/brand/ai/tools.ts` con sus mismos topes: preview del `body` a 1.500 caracteres y máximo 15 notas por resultado, porque 15 notas largas son ~30k tokens en un solo `tool_result`. **Sin herramienta de borrado.**

Colecciones: `OBJECIONES`, `DOLORES`, `ANGULOS`, `SEGMENTOS`, `MENSAJES`, `APRENDIZAJES`.

Pantalla `/leads/conocimiento`, reusando la grilla de la biblioteca de marca. No es opcional: **una memoria que sólo el modelo puede leer es una caja negra**, y el día que empiece a repetir una conclusión equivocada no habría dónde ir a corregirla.

### 1.19 Experimentación de aperturas

> **Estado (2026-09-26): implementado y desplegado, verificación manual PENDIENTE.** Migración `20260926170000_lead_angle_variant_performance.sql` (RPC `lead_angle_variant_performance()`, aplicada con `db push`), `ANGLE_MIN_SAMPLE = 20` en `components/leads/dashboard/angle-experiments.tsx`, mostrada en `/leads`.
>
> Con cero aperturas confirmadas hoy (recién se cierra §1.11), la tabla va a estar vacía o con `n` bajo el mínimo hasta que se use el copiloto en leads reales — es el resultado esperado, no un bug.

Sin tabla nueva: `angle` y `variant` ya están en `lead_messages` desde §1.9. Una RPC agrupa por ángulo y variante y devuelve tasa de respuesta humana, de calificación y de agenda — lo que el `SPA §27` quiere poder comparar.

> **Con 184 contactos repartidos en nueve ángulos, ninguna diferencia es significativa.** La pantalla muestra el `n` al lado de cada porcentaje y no declara ganadores por debajo de `ANGLE_MIN_SAMPLE = 20`. Es la misma regla que `Plans/03 §3.11` fijó con `SIN_BASELINE`: clasificar contra tres datos es fabricar evidencia, y fabricar evidencia sobre qué mensaje funciona es peor que no medir.

### Lo que estos pasos no hacen

Queda explícitamente afuera, y es la segunda etapa del `SPA §33`: envío automático, API de WhatsApp, sincronización de conversaciones, integración de calendario, agentes autónomos y lead scoring predictivo. También queda afuera un chat libre con el copiloto — el `SPA §22` pide un panel que **renderiza** la memoria, no una conversación paralela a la del lead.

Primero hay que validar que el copiloto tome buenas decisiones. Automatizar un criterio que todavía no se probó es multiplicar un error.

### 1.20 Centro de seguimiento

> **Estado (2026-09-29): implementado y verificado en la app real — cerrado.** `lib/leads/queries.ts` (`listFollowUpQueue`), `components/leads/follow-up-queue.tsx` y `app/(app)/leads/seguimiento/page.tsx`, agregada al sidebar (`components/shell/nav.ts`) y enlazada con "Ver todos" desde el widget de atención de `/leads`. Los 7 ítems del checklist manual, ok.

**No es un motor nuevo — es una pantalla sobre lo que §1.16 y §1.14 ya calculan.** Antes de este paso, la única superficie para "a quién le toca seguimiento" era el widget de atención del dashboard (`listStaleLeads`), acotado a 5 filas para caber en una card. La detección en sí — un `AHORA_NO` con fecha de retomar automática desde `analyzeLeadResponseAction` (§1.14), o el campo manual de próxima acción de la ficha (§1.3) — ya estaba construida y no se tocó.

`listFollowUpQueue()` reusa la misma condición de `listStaleLeads` (estados no terminales, `next_action_at` vencido o `last_contacted_at`/`created_at` más viejo que `days`), pero con el join completo (`SELECT_LEAD_ROW`: rubro, lista, próxima acción) y sin el tope de 5. Devuelve cada lead con un flag `overdue` en vez de un string, para que la pantalla separe dos preguntas distintas en dos secciones:

- **Seguimiento vencido** — tiene una fecha de retomar (`next_action_at`) ya cumplida. Ordenado por cuánto hace que venció.
- **Sin contactar** — nunca se le escribió, o se enfrió desde el último contacto. Ordenado por antigüedad.

**Decisión de implementación que el plan no fijaba: sin paginación real.** `listFollowUpQueue` trae hasta 200 filas con un solo `.limit()`, no `.range()` con controles de página como `/leads/lista`. Con el volumen actual (una sola cuenta, generación manual de listas) 200 alcanza de sobra; si el volumen crece, agregar paginación ahí es un cambio local a una función.

> **Rediseño (2026-10-01), pedido tras usar la pantalla:** "Sin contactar" no tenía sentido — esos leads son contactos cargados para escribirles después. `listFollowUpQueue()` ahora devuelve sólo **prospecciones abiertas**: `last_contacted_at` no nulo y estado no terminal, en una sola lista ordenada por último contacto más viejo primero (con el motivo "Sin novedades" a partir de 7 días, o "Retomar vencido" si hay `next_action_at` cumplido). Cada fila lleva a `/leads/[id]?modo=seguimiento`. En la ficha, `LeadComposer` suma un selector "Analizar respuesta / Seguimiento" para cualquier lead contactado (antes el seguimiento sólo existía para un `AHORA_NO` vencido), y `generateFollowup()` ahora recibe el hilo de mensajes además de notas, memoria y enriquecimiento, y arranca del último mensaje enviado o recibido. **Checklist manual pendiente** (los ítems 4, 5 y 7 de abajo describen el diseño anterior).

**Verificación manual** (`CLAUDE.md` §13):

1. Ir a `/leads` (dashboard): en el bloque "ATENCIÓN" aparece un link "Ver todos" al lado del título "Sin tocar hace más de 7 días".
2. Hacer clic en "Ver todos" → navega a `/leads/seguimiento`, y la entrada "Seguimiento" aparece en el sidebar del Gestor de Leads, entre "Generar lista" y "Agenda".
3. En un lead cualquiera, poner a mano una **próxima acción con fecha pasada** (ficha del lead, campo de próxima acción de §1.3) → guardar → volver a `/leads/seguimiento`: el lead aparece en "Seguimiento vencido", con el motivo "Vencido hace N días" (o "Vence hoy" si la fecha es de hoy).
4. Un lead sin `next_action_at` pero sin contactar hace más de 7 días (o nunca contactado) aparece en "Sin contactar", con "N d sin contacto" o "N d sin tocar" según corresponda.
5. Un lead en `CERRADO_GANADO`, `CERRADO_PERDIDO` o `DESCARTADO` **no aparece** en ninguna de las dos listas, aunque tenga una próxima acción vencida o esté sin tocar hace mucho.
6. El badge de rubro muestra el color propio del rubro (o "—" si el lead no tiene rubro asignado), y el badge de estado muestra la etiqueta correcta en español.
7. Con las dos listas vacías (o probando en una cuenta sin leads vencidos/fríos), cada sección muestra su mensaje de estado vacío en vez de una tabla en blanco.

### 1.21 Alta manual de un lead (y de una lista manual vacía)

> **Estado (2026-09-30): implementado y verificado en la app real — cerrado.** `lib/leads/actions.ts` (`createLeadManually`, `createEmptyLeadList`, `createManualList` como helper compartido, y `updateLeadNotes` rediseñado), `components/leads/add-lead-dialog.tsx`, `components/leads/create-list-dialog.tsx` y `components/leads/lead-notes-form.tsx` (rediseñado). Botones "Agregar lead" y "Nueva lista" en `components/leads/lists-browser.tsx` (`/leads/lista`), y las mismas dos acciones en `components/leads/empty-lists-actions.tsx` para cuando todavía no hay ninguna lista. Los 13 ítems del checklist manual, ok — incluye un bug real (nota sin log al crear un lead) y una corrección de diseño (el cuadro de notas pasó de "nota actual" a registro) encontrados y resueltos durante la propia verificación.

**"Nueva lista" se sumó sobre la marcha, durante la verificación de este mismo paso**: al probar el alta de un lead, hacía falta poder crear primero una lista manual vacía sin pasar por scraping ni CSV — el `+ Crear lista nueva…` del formulario de alta ya lo resolvía al vuelo, pero sólo junto con un lead. `createManualList()` extrae esa lógica (con el chequeo de nombre duplicado que el alta de lead no tenía) para que también la use un botón "Nueva lista" independiente, en `/leads/lista` y en su estado vacío.

> **Bug real encontrado y corregido, también durante la verificación:** una nota escrita en el campo "Notas" del alta manual quedaba guardada en `leads.notes`, pero sin la fila correspondiente en `lead_activities` (`type: 'NOTA'`) que sí genera `updateLeadNotes` cuando se edita una nota desde la ficha (§1.3). El síntoma: el cuadro de notas de la ficha aparecía precargado con el texto, pero al tocar "Guardar" sin cambiar nada, `updateLeadNotes` compara contra el valor anterior y —correctamente para ese caso— no duplica el log si no hay cambio; el problema es que nunca hubo un primer log. `createLeadManually` ahora escribe esa actividad al crear el lead, si vino una nota.

Cubre el caso que ninguna fuente de §1.2 resuelve: un lead contactado por fuera de la app (mensaje directo, referido, alguien que se cruzó en la calle) que igual tiene que entrar al mismo seguimiento que uno scrapeado. No es un quinto proveedor — no crea `scrape_job`. La lista es obligatoria, no opcional como se pensó en la primera versión de este paso (ver abajo): siempre existente elegida en el formulario, o una nueva creada ahí mismo con sólo el nombre.

**Misma deduplicación que el resto** (`computeDedupeKey`, `owner_id` + `dedupe_key`, `CLAUDE.md` §4), pero con una diferencia deliberada frente a la importación por lotes: acá un choque **no se pisa en silencio**. CSV y Apify hacen `upsert` porque reimportar la misma zona es esperable y se quiere que enriquezca lo que ya existe; una alta manual es un solo lead cargado a propósito, así que si el teléfono o el sitio ya están en la base, la acción devuelve un error nombrando el lead existente en vez de sobreescribirlo.

**Estado inicial editable, con `CONTACTADO` por defecto** — quien carga el lead ya lo contactó por su cuenta, así que arrancar en `NUEVO` sería falso. Si el estado elegido no es `NUEVO`, se escribe además una fila en `lead_activities` (`CAMBIO_ESTADO`, de `NUEVO` al estado elegido) y se fija `last_contacted_at = ahora`, igual que cualquier otro cambio de estado (§1.3) — así el lead no aparece como "sin contactar" en el centro de seguimiento (§1.20) apenas se lo carga.

> **Corrección encontrada en la verificación manual (2026-09-29): la lista pasó de opcional a obligatoria.** La primera versión de este paso dejaba "Sin lista" como opción (`lead_list_id = null`, soportado por el esquema de §1.1) y redirigía a la ficha del lead recién creado para no perderlo de vista al crearlo. El checklist mostró el problema real: `/leads/lista/[id]` (§1.3) es por lista, no hay una vista de "todos los leads" cruzando listas, así que apenas se salía de esa ficha el lead quedaba inencontrable salvo por el buscador global (`searchCommandPalette`), que no alcanza como flujo principal. La opción elegida fue sacar "Sin lista" del formulario: si no hay una lista que sirva, el mismo formulario crea una con `source: 'MANUAL'` (ya estaba en el enum `lead_source` desde la migración inicial, sin usar hasta este paso) y sólo pide el nombre. El redirect a la ficha se mantuvo — sigue siendo útil para arrancar a trabajar el lead apenas se lo carga, aunque ya no sea la única forma de encontrarlo.

**Verificación manual** (`CLAUDE.md` §13):

1. En `/leads/lista` (con al menos una lista existente), aparece el botón "Agregar lead" al lado de "Generar lista".
2. Completar sólo el nombre (dejando la lista en la que quedó seleccionada por defecto) y guardar → redirige a la ficha del lead recién creado (`/leads/[id]`), con estado "Contactado", sin rubro, colgado de esa lista.
3. Completar todos los campos (teléfono, email, sitio, ciudad, rubro, lista existente, estado, notas) y guardar → redirige a la ficha, y desde `/leads/lista/[id]` de la lista elegida el lead aparece con el rubro y las notas guardadas.
4. Elegir "+ Crear lista nueva…", escribir un nombre y guardar → se crea una lista nueva con ese nombre (visible en `/leads/lista`, con la fuente que muestra "CSV / manual") y el lead queda colgado de ella.
5. Repetir el alta con el **mismo teléfono** que un lead ya cargado → el diálogo no se cierra ni redirige, y muestra el error nombrando el lead existente; no se crea un duplicado ni una lista de más.
6. Cargar un lead dejando el estado en "Nuevo" → no se escribe ninguna fila en `lead_activities`, y el lead **sí** aparece en "Sin contactar" del centro de seguimiento (§1.20).
7. Cargar un lead con estado "Contactado" (el default) → se escribe una actividad de cambio de estado NUEVO → CONTACTADO en su timeline, y el lead **no** aparece en el centro de seguimiento.
8. Botón "Nueva lista" al lado de "Agregar lead" → crear una lista sólo con nombre (sin rubro) → aparece en `/leads/lista` con 0 leads, sin haber tocado Apify ni CSV.
9. Repetir "Nueva lista" con un nombre que ya existe → error "Ya existe una lista con ese nombre.", no se crea una segunda.
10. Con la cuenta sin ninguna lista (estado vacío de `/leads/lista`), aparecen los dos botones — "Nueva lista vacía" y "Generar lista" — y el primero crea la lista y la pantalla pasa a mostrarla en vez de quedarse en el estado vacío. *(Verificado por lectura de código, no en vivo — hacerlo en vivo implicaba vaciar listas reales.)*
11. Cargar un lead nuevo con una nota → en su ficha, el timeline muestra esa nota como actividad (`NOTA`), no sólo en el cuadro de texto — confirma el fix del bug de abajo.
12. En la ficha de cualquier lead, escribir una nota en el cuadro "Nueva nota" y guardar → queda en la actividad, y **el cuadro se vacía** (no vuelve a mostrar lo que se acaba de guardar). Recargar la página: sigue vacío.
13. Guardar sólo la "Próxima acción" con el cuadro de nota vacío → se actualiza la fecha y no se agrega ninguna actividad `NOTA` vacía ni se borra la última nota guardada (`leads.notes`, que sigue usándose como "más reciente" para el CSV de §1.3).

> **Bug real encontrado y corregido durante esta misma verificación (ítem 3, 2026-09-29):** una nota escrita en el campo "Notas" del alta manual quedaba guardada en `leads.notes`, pero sin la fila correspondiente en `lead_activities` (`type: 'NOTA'`) que sí genera `updateLeadNotes` cuando se edita una nota desde la ficha (§1.3). `createLeadManually` ahora escribe esa actividad al crear el lead, si vino una nota.
>
> **Decisión de diseño que salió de este mismo bug, y que cambia el comportamiento en toda la app (no sólo el alta manual):** el cuadro de "Notas" de la ficha mostraba siempre la última nota guardada, precargada — el mismo motivo por el que el bug de arriba pasó desapercibido (el texto ya estaba ahí, así que "Guardar" sin tocarlo parecía no hacer nada). Se decidió que el cuadro pase a ser **un registro**: se escribe una nota, se guarda, queda en el timeline, y el cuadro se vacía para la siguiente — igual que cualquier otra actividad, en vez de funcionar como un campo "nota actual". `leads.notes` se sigue actualizando (con la nota más reciente, para el CSV de §1.3), pero ya no se usa como valor inicial del formulario, y un guardado sin nota nueva no lo toca. `updateLeadNotes` (`lib/leads/actions.ts`) y `LeadNotesForm` (`components/leads/lead-notes-form.tsx`) se reescribieron para esto.
>
> El primer lead cargado con el bug original todavía activo (Daniel Seisdedos, id `4535f6dd-c8b7-4e0c-8c9a-ebad281c3b70`) no se pudo corregir con un `insert` directo en `lead_activities` — dos intentos por `curl` con la service role key quedaron bloqueados por el clasificador de seguridad de Claude Code, y el `insert` manual por SQL Editor que se le pidió al usuario tampoco llegó a aplicarse. Se resolvió por la vía normal de la app: editar la nota existente (un carácter alcanza) y guardar, lo que sí dispara el log porque el texto cambió.

### 1.22 Cadena de ejecución (reabre §1.6)

> **Estado (2026-09-30): implementado, verificación manual PENDIENTE.** Migraciones `20260930120000_sales_goals.sql` y `20260930130000_execution_metrics_booking_window.sql` (aplicadas con `db push`, tipos regenerados), `lib/leads/execution/{chain,blend,queries,actions,summary}.ts`, `lib/leads/goals.ts`, `components/leads/execution/{goal-form-dialog,daily-contacts-chart}.tsx` y `app/(app)/leads/objetivo/page.tsx`, agregada al sidebar. Tile "Hoy" en el dashboard `/leads`.

Lleva a la app la planilla "Mi cadena de ejecución": de un objetivo de facturación mensual, un ticket promedio y tres tasas, cuántos **contactos por día** hacen falta — y que esas tasas, cargadas a ojo, se corrijan solas con lo que pasa de verdad.

**La cadena**, idéntica a la planilla (`buildChain`, pura): clientes = ⌈facturación / ticket⌉ → llamadas = ⌈clientes / cierre⌉ → agendas = ⌈llamadas / asistencia⌉ → contactos/mes = ⌈agendas / agenda⌉ → contactos/día = ⌈contactos/mes / días hábiles⌉ → contactos/semana = contactos/día × días por semana. Con 2000 / 500 / 15 % / 75 % / 10 % / 20 / 6 da 4 · 27 · 36 · 360 · 18 · 108.

**Ticket a ojo, no facturación real.** El Gestor de Facturación es la Fase 2 y no se adelanta (`CLAUDE.md` §2). La facturación del mes se muestra como *estimada* (ganados × ticket) a través de `RevenueSource` en `lib/leads/goals.ts`; cuando exista Facturación se implementa otra fuente ahí.

**Un contacto es el primer toque saliente a un lead**, venga de donde venga — la vista `lead_first_contacts` toma el `min()` de: mensaje del vendedor confirmado (§1.11), actividad WhatsApp / email / llamada (§1.3), o cambio de estado que lo saca de `NUEVO`/`LISTO` (alta manual de §1.21). Un segundo mensaje al mismo lead no suma.

**Las tres tasas observadas** (`leads_execution_metrics`, ventana 7 / 30 / 90 días):

- *Agenda*: de los leads con primer contacto en una ventana **corrida 7 días hacia atrás** (`BOOKING_LAG_DAYS`), cuántos llegaron a una reunión (turno cargado o estado de reunión en adelante alguna vez). Se corre en vez de recortarse porque un contacto de ayer todavía no tuvo tiempo de agendar — la primera versión recortaba, y con la ventana de 7 días la cohorte quedaba siempre vacía (de ahí la segunda migración).
- *Asistencia*: turnos colgados de un lead, ya pasados: `REALIZADA / (REALIZADA + NO_ASISTIO)`. Los que quedaron en "agendada" sin marcar no cuentan.
- *Cierre*: de los leads con reunión realizada en la ventana, cuántos llegaron a `CERRADO_GANADO`.

**Mezcla automática** (`blendRate`): `usada = (k · supuesta + éxitos) / (k + n)`. La tasa del usuario vale como `k` observaciones imaginarias — 50 para agenda, 10 para asistencia y cierre, proporcional al volumen natural de cada etapa. Con n = 0 manda el supuesto; con n ≫ k manda lo real. La pantalla muestra supuesta · observada (con éxitos/n) · usada · peso de los datos, y marca "muestra chica" por debajo de `RATE_MIN_SAMPLE`, con el mismo criterio que `ANGLE_MIN_SAMPLE` (§1.19). La cadena aparece dos veces: con tus tasas y con las ajustadas, que es la que manda.

**Una sola meta activa** (índice único parcial, como `brand_goals` de `Plans/03 §3.13`); `sales_define_goal` archiva la anterior y crea la nueva en una transacción, así queda el historial.

**Verificación manual** (`CLAUDE.md` §13):

1. `/leads/objetivo` sin objetivo → estado vacío con "Definir objetivo"; el dashboard `/leads` muestra el tile "Hoy —" con el link "Definir objetivo".
2. Definir el objetivo con los valores prellenados (2000 / 500 / 10 % / 75 % / 15 % / 20 / 6) → la cadena da 4 · 27 · 36 · 360 · 18 · 108 en la columna "Con tus tasas".
3. Registrar un WhatsApp en un lead nunca contactado → "Hoy" sube en 1. Registrar otro mensaje al mismo lead → no sube.
4. Confirmar una apertura del copiloto en otro lead nunca contactado → sube en 1. Alta manual de un lead en `CONTACTADO` (§1.21) → sube en 1.
5. Una tasa sin datos muestra "sin datos", 0/0, y la usada es igual a tu supuesto.
6. Marcar un turno pasado como realizado y otro como no asistió → la asistencia observada muestra 50 % (1/2, "muestra chica") y la usada se mueve apenas desde 75 % (≈ 70,8 %).
7. Cambiar 7d / 30d / 90d → cambian las observadas, las usadas y la columna ajustada.
8. "Editar objetivo" con otros valores → la cadena se recalcula; en la base queda una sola fila `ACTIVA` y la anterior `ARCHIVADA`.
9. El gráfico "Contactos por día" muestra los días del mes con la línea de objetivo; los días que llegaron al objetivo en amarillo, tooltip por barra.
10. El sidebar muestra "Objetivo" debajo de "Dashboard", y el tile "Hoy X / Y" del dashboard lleva a `/leads/objetivo` con los mismos números.

---

## Fases siguientes (fuera de alcance ahora)

- **Fase 2 — Gestor de Facturación.** Al terminarlo, se implementa una `RevenueSource` real en `lib/leads/goals.ts` y la facturación de la cadena de ejecución (§1.22) deja de ser estimada
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

SmokIA_Sistema_de_Prospeccion.md   ← el system prompt literal (§1.7)
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
