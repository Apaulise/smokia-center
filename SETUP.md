# Setup

Pasos manuales que hay que hacer una sola vez. Todo lo demás lo corre la app.

---

## 1. Crear el proyecto en Supabase

1. Entrar a [supabase.com/dashboard](https://supabase.com/dashboard) y crear un proyecto nuevo
   - **Nombre:** `smokia`
   - **Región:** la más cercana (São Paulo para Argentina)
   - **Database password:** generarla y guardarla — hace falta en el paso 2 y no se puede recuperar después, sólo resetear
2. Esperar a que termine de aprovisionar (~2 minutos)

## 2. Conectar el repo al proyecto

```bash
npx supabase login          # abre el navegador
npx supabase link           # elegir el proyecto de la lista; pide la password del paso 1
```

Esto crea `supabase/.temp/` con la referencia al proyecto. No se versiona.

## 3. Variables de entorno

Crear `.env.local` en la raíz (está en `.gitignore`, no se sube nunca).

Las claves salen del panel: **Settings → API**.

```bash
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon public>
SUPABASE_SERVICE_ROLE_KEY=<service_role secret>

APP_ENCRYPTION_KEY=<generar, ver abajo>
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=<generar, ver abajo>

# Quién puede entrar (separados por coma). Sin esto no entra nadie.
ALLOWED_EMAILS=vos@ejemplo.com,socio@ejemplo.com
```

Generar los dos secretos propios:

```bash
openssl rand -base64 32    # APP_ENCRYPTION_KEY  (32 bytes, base64)
openssl rand -hex 32       # CRON_SECRET
```

> **`APP_ENCRYPTION_KEY` no se rota a la ligera.** Cifra el token de Apify guardado en la base; si se pierde o cambia, ese token queda ilegible y hay que volver a cargarlo desde `/configuracion`.

> **Para probar contra el CRM existente en localhost:** copiá `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `APP_ENCRYPTION_KEY` y `ALLOWED_EMAILS` del despliegue. La misma clave de cifrado permite leer la API key de Gemini que ya está guardada en `settings`. No subas `.env.local` al repositorio ni compartas estas variables en un chat.

> **`SUPABASE_SERVICE_ROLE_KEY` saltea RLS.** Nunca prefijarla con `NEXT_PUBLIC_`, nunca importarla desde un componente.

## 4. Aplicar el esquema

```bash
npm run db:push     # aplica supabase/migrations/ al proyecto
npm run db:types    # regenera lib/supabase/database.types.ts
```

`db:types` se corre **después de cada migración**. Ese archivo no se edita a mano.

## 5. Login con Google ✅ hecho y verificado (2026-10-03)

**En Google Cloud Console** → APIs & Services → OAuth consent screen (✅ hecho):

- Tipo *External*, en modo **Testing**
- **Test users:** agregar los dos mails de `ALLOWED_EMAILS`. En modo Testing sólo ellos pueden pasar por el consent screen

**En Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client ID (tipo *Web application*) (✅ hecho):

- **Authorized redirect URI:** `https://<ref>.supabase.co/auth/v1/callback`

**En Supabase** (✅ hecho) → Authentication → Providers → Google: pegar el Client ID y el Client Secret.

**En Supabase** (✅ hecho) → Authentication → URL Configuration:

- **Site URL:** `http://localhost:3000` (cambiar a la URL de Vercel al desplegar)
- **Redirect URLs:** agregar `http://localhost:3000/**` y, más adelante, `https://<tu-app>.vercel.app/**`

Si alguien entra con Google usando el mismo mail con el que ya tiene cuenta por contraseña, Supabase vincula las dos identidades al mismo usuario: los datos no se duplican.

## 6. Mails de Auth (reset de contraseña con código) ⏸ diferido: falta dominio propio para Resend

El SMTP por defecto de Supabase sólo le manda a miembros de la organización y con un límite de pocos mails por hora. Se usa **Resend** (free tier):

1. **En Resend:** verificar un dominio propio (DNS) y crear una API key. Sin dominio verificado, Resend sólo le manda al mail dueño de la cuenta de Resend — el socio no recibiría nada
2. **En Supabase** → Authentication → Emails → SMTP Settings → *Enable custom SMTP*:
   - Host `smtp.resend.com`, puerto `465`, usuario `resend`, password = la API key de Resend
   - Sender: `no-reply@<tu-dominio>`, nombre `SmokIA`
3. **En Supabase** → Authentication → Emails → Templates → **Reset Password**: el cuerpo tiene que mostrar el código, no el link. Por ejemplo:
   ```html
   <h2>Recuperá tu contraseña</h2>
   <p>Tu código para SmokIA es:</p>
   <p style="font-size:28px;font-family:monospace;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
   <p>Vence en una hora. Si no lo pediste, ignorá este mail.</p>
   ```
4. **En Supabase** → Authentication → Providers → Email: **Email OTP Length = 6** (la pantalla `/recuperar` espera 6 dígitos) y vencimiento 3600 s

## 7. Arrancar

```bash
npm run dev
```

Antes de probar con una clave real, `npm run test:gemini` verifica localmente que el enriquecimiento pide URL Context sin Google Search y sólo marca como verificada una URL recuperada. `npm run build:verify` compila la app en una carpeta separada del servidor de desarrollo.

---

## Al desplegar en Vercel

1. Cargar las mismas variables de `.env.local` en **Settings → Environment Variables**
2. `NEXT_PUBLIC_APP_URL` pasa a ser la URL real de Vercel — **Apify la usa para el webhook**, así que con `localhost` los resultados nunca vuelven solos
3. Agregar la URL de Vercel a las **Redirect URLs** de Supabase Auth (paso 5), y cambiar la **Site URL** a esa URL (los links de confirmación de cuenta apuntan ahí)
4. Verificar que la service role key no quedó en el bundle del cliente:
   ```bash
   npm run build && grep -r "service_role" .next/static || echo "limpio"
   ```

## API de automatización (opcional)

`/api/automation/*` deja que una automatización (n8n, un script, un agente) lea la cola de leads, cree un lead, pida la apertura generada por la IA, corrija teléfono, notas o la próxima acción, y registre los contactos sin pasar por la UI. Usa la service role key y queda atada a **un solo usuario**.

1. Generar el secreto: `openssl rand -hex 32` → `AUTOMATION_API_SECRET` (mínimo 32 caracteres; sin él la API responde 401 a todo)
2. Buscar el UUID del dueño de los leads: Supabase → **Authentication → Users** → columna **UID** del mail → `AUTOMATION_OWNER_ID`. (Alternativa en el SQL Editor: `select id, email from auth.users;`)
3. Opcional: `AUTOMATION_WRITE_AGENTS` — lista separada por comas de quién puede hacer el PATCH de corrección y el POST de alta. Si no está, el PATCH lo hacen sólo `ventas` y `seguimiento`; el POST también deja pasar a `julian`. Una lista explícita reemplaza el default en los dos (`ventas,auditor` deja afuera a seguimiento y a julian). No hace falta para leer ni para registrar un contacto de verdad
4. Opcional y apagado por defecto: `AUTOMATION_ADMIN_AGENTS` — lista separada por comas de quién puede usar `/api/automation/admin/*` (acceso total al CRM de ese owner). Sin la variable, o vacía, nadie entra aunque el Bearer sea válido. Para el orquestador: `AUTOMATION_ADMIN_AGENTS=mr-pou`. No se suma a `AUTOMATION_WRITE_AGENTS`: el PATCH y el alta históricos siguen igual
5. Cargar las variables en `.env.local` y en Vercel (**Settings → Environment Variables**) y redeployar
6. Toda llamada lleva `Authorization: Bearer $AUTOMATION_API_SECRET`

No hay migración nueva para el PATCH ni para el alta: usan columnas y la actividad `NOTA` que ya existen.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/automation/leads` | Cola de leads. Filtros: `status` (coma, default `NUEVO,LISTO`), `industry` (UUID o nombre del rubro), `list`, `city`, `uncontacted=true`, `has_phone` (default `true`), `limit` (default 25, máx. 100). Cada lead incluye `email` |
| POST | `/api/automation/leads` | Crea un lead en `NUEVO`. Pide agente. Ver abajo |
| GET | `/api/automation/leads/:id` | Un lead (con `email`) + últimas 20 actividades y mensajes |
| PATCH | `/api/automation/leads/:id` | Corrige `phone`, `notes` y/o `next_action_at` sin registrar un contacto. Pide agente. Ver abajo |
| POST | `/api/automation/leads/:id/opening-message` | Apertura de la IA (Groq, la key de Configuración del owner). Si ya se envió una, devuelve esa salvo `?regenerate=true` |
| POST | `/api/automation/leads/:id/contact` | Registra el mensaje enviado (`lead_messages`) + el contacto (timeline, `last_contacted_at`, estado, próxima acción). No pide agente |
| POST | `/api/automation/leads/:id/status` | Cambio de estado, con el mismo gate de reuniones que la UI. No pide agente |
| * | `/api/automation/admin/*` | Rol admin. Pide un agente de `AUTOMATION_ADMIN_AGENTS` (apagado si la variable no está). Ver abajo |

`GET /api/automation/leads` y `GET /api/automation/leads/:id` incluyen `email` en el lead: el valor guardado en `leads.email`, o `null` si no tiene (un string vacío se devuelve vacío). No hay migración: la columna ya existía. El PATCH no acepta `email`. El POST sí lo guarda, en minúsculas, y el lead creado se lee por esas dos rutas.

La cola (`GET /api/automation/leads`) sigue con `has_phone=true` por defecto: un lead creado sólo con email no entra en esa cola hasta pedir `has_phone=false`, o hasta tener teléfono. `GET /api/automation/leads/:id` lo devuelve igual, con el email.

### POST `/api/automation/leads`

Crea un lead del owner de `AUTOMATION_OWNER_ID`, en estado `NUEVO`, sin `last_contacted_at` y sin mensaje. Siempre deja una actividad `NOTA` con el texto `[agente] lead creado vía API`.

| Campo | Qué es |
|---|---|
| `name` | Obligatorio |
| `city`, `website`, `email`, `phone`, `notes` | Opcionales. Vacío o `null` se guarda como `null` |
| `list` o `lista` | Id o nombre de una lista que ya existe (el nombre no distingue mayúsculas). Si vienen los dos, tienen que coincidir. Sin lista, el lead queda suelto (se ve en la cola y en la ficha, no dentro de una lista) |
| `agent` | En el body o en el header `X-Agent`. Misma regla que el PATCH |

El teléfono se normaliza como el PATCH (Argentina, `+54` si no trae país) y se guarda canónico. Un número con menos de 6 dígitos responde 400. El email se guarda en minúsculas.

Si ya hay un lead de ese owner con el mismo teléfono, el mismo email, el mismo sitio (dominio) o el mismo nombre y ciudad, responde **409** con `{ "error", "id" }` del lead existente y no escribe nada. El id del 409 es el que se puede leer con `GET /api/automation/leads/:id`.

`list`/`lista` no crea listas. Un id o un nombre que no existe responde 400. Dos listas con el mismo nombre responden 400: hay que pasar el id.

El agente, si `AUTOMATION_WRITE_AGENTS` no está, puede ser `ventas`, `seguimiento` o `julian`. Sin agente, 400. Otro id, 403.

```bash
curl -s -X POST "$APP_URL/api/automation/leads" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "julian",
    "name": "Acme",
    "city": "Rosario",
    "email": "hola@acme.com",
    "phone": "+54 9 11 5555-6666",
    "website": "https://acme.com",
    "lista": "Dentistas Rosario",
    "notes": "Llegó por el formulario."
  }'
```

La respuesta es 201: `{ "lead", "agent", "activity" }`. `lead` tiene la misma forma que en el GET (incluye `email`, `phone`, `phoneE164`, `status: "NUEVO"` y `list`). `activity` es `{ "type": "NOTA", "content": "[julian] lead creado vía API" }`.

### PATCH `/api/automation/leads/:id`

Corrige datos del lead cuando la realidad no coincide con lo guardado (el WhatsApp real es otro, hay que anotar el próximo paso, hay que borrar una fecha). **No** crea un mensaje ni un contacto: no toca `status` ni `last_contacted_at`, y no inserta en `lead_messages`. Si algo cambió, deja una actividad `NOTA` en el historial de la ficha, con el agente al principio del texto (`[seguimiento] …`). Repetir el mismo body no duplica la nota ni reescribe la fila.

El teléfono se normaliza como el resto de la app (Argentina: si no trae país se asume `+54`). Se guarda en forma canónica (`+54911…`). Si ese número ya es la clave de otro lead del mismo dueño, responde 409 y no escribe nada. Un número demasiado corto (menos de 6 dígitos) responde 400.

Hace falta al menos uno de `phone`, `notes` o `next_action_at`. `null` (o `""`) borra ese campo. `next_action_at` es ISO 8601 **con zona** (`2026-10-30T15:00:00-03:00` o `…Z`).

El agente va en el body (`"agent": "ventas"`) o en el header `X-Agent`. El id es corto: letras, números y guiones. Mayúsculas no importan. Si vienen los dos, tienen que coincidir. Sin agente, responde 400. Cualquier otro id responde 403. Quien ya llamaba este PATCH tiene que mandar el agente. Los GET, el POST de contacto y el cambio de estado no lo piden.

```bash
# Corregir WhatsApp, dejar nota y fijar la próxima acción
curl -s -X PATCH "$APP_URL/api/automation/leads/$LEAD_ID" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "seguimiento",
    "phone": "+54 9 11 5555-6666",
    "notes": "El WhatsApp real es este. Retomar el jueves.",
    "next_action_at": "2026-10-30T15:00:00-03:00"
  }'

# Sólo la fecha, con el agente en el header. null la borra.
curl -s -X PATCH "$APP_URL/api/automation/leads/$LEAD_ID" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -H "X-Agent: ventas" \
  -d '{ "next_action_at": null }'

# Borrar un teléfono que estaba mal
curl -s -X PATCH "$APP_URL/api/automation/leads/$LEAD_ID" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "agent": "ventas", "phone": null }'
```

La respuesta es el lead actualizado: `id`, `name`, `phone`, `phoneE164`, `notes`, `nextActionAt`, `status`, `updatedAt`, `agent` y `activity` (`{ "type": "NOTA", "content": "…" }` o `null` si no hubo cambio). `activity: null` con 200 quiere decir que esos datos ya estaban así.

### Rol admin (`mr-pou`) — `/api/automation/admin/*`

Acceso de lectura y escritura al CRM del owner de `AUTOMATION_OWNER_ID`. Pensado para el orquestador. El Bearer es el mismo. El agente va en `agent` o en `X-Agent` y tiene que estar en `AUTOMATION_ADMIN_AGENTS`. Si la variable no está, estos endpoints responden 403 (o 400 si falta el agente) aunque `ventas`, `seguimiento` o `julian` llamen con el Bearer. Un GET sin body usa el header.

No reemplaza los endpoints de arriba: el PATCH de corrección sigue sin aceptar `status` ni `email`, y sigue limitado a `AUTOMATION_WRITE_AGENTS`.

Todo queda filtrado por `owner_id`. El body no puede mandar `owner_id`, `id`, `created_at`, `updated_at`, `dedupe_key` ni `search`. Cada escritura que toca un lead deja una actividad `NOTA` con el texto `[mr-pou] …` (el id real del agente). El contenido de un mensaje o de una actividad se guarda tal cual: la nota de auditoría es otra fila.

Lista blanca (nada más entra: ni `settings`, ni `scrape_jobs`, ni perfil, ni marca, ni `teams` / `team_members` / `team_goals`):

| Recurso | Tabla | Borrado |
|---|---|---|
| `leads` | `leads` | soft: `status = DESCARTADO`. No hay borrado físico |
| `lead_lists` | `lead_lists` | físico. Los leads de la lista quedan con `lead_list_id` vacío |
| `lead_activities` | `lead_activities` | físico |
| `lead_messages` | `lead_messages` | físico |
| `lead_intel` | `lead_intel` | físico |
| `lead_signals` | `lead_signals` | físico |
| `industries` | `industries` | físico |
| `appointments` | `appointments` | físico. Es la agenda; no hay una tabla `tasks` |
| `message_templates` | `message_templates` | físico |
| `sales_goals` y `goals` | `sales_goals` | físico. `goals` es el mismo recurso |
| `sales_knowledge` | `sales_knowledge` | físico. `search` no se lee ni se escribe |

El cuerpo genérico va en snake_case, como la base. Los endpoints viejos siguen en camelCase.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/automation/admin` | Catálogo: recursos, columnas escribibles, filtros y orden. Pide `X-Agent` |
| GET | `/api/automation/admin/:resource` | Lista. `limit` (default 50, máx. 100), `offset`, `order`, `dir=asc\|desc`, más los filtros del catálogo (`lead_id`, `status`, …). En leads, `raw` no viene en la lista salvo `include_raw=true` |
| GET | `/api/automation/admin/:resource/:id` | Una fila, con `raw` si la tabla lo tiene |
| POST | `/api/automation/admin/:resource` | Alta. `owner_id` lo pone el servidor |
| PATCH | `/api/automation/admin/:resource/:id` | Actualización parcial. Un lead acepta `status`, `email`, `notes`, `next_action_at` y el resto de columnas de la lista |
| DELETE | `/api/automation/admin/:resource/:id?confirm=true` | Pide `confirm=true` en el query o `"confirm": true` en el body. En leads es soft |
| POST | `/api/automation/admin/lead-status` | `{ "lead_id", "status" }`. Mismo gate de reuniones que la UI (`REUNION_AGENDADA` / `REUNION_REALIZADA` necesitan un turno). Deja `CAMBIO_ESTADO` y la nota `[agente]` |
| POST | `/api/automation/admin/lead-activity` | `{ "lead_id", "content", "type"? }`. `content` se guarda exacto. `type` default `NOTA` |
| POST | `/api/automation/admin/lead-message` | `{ "lead_id", "sender", "content", "channel"? }`. `content` exacto. `confirmed` default `true` (entra al hilo). No cambia `status` ni `last_contacted_at` |

Al crear un `sales_goals` / `goals` activo, si ya había uno `ACTIVA` del mismo owner se archiva y queda el nuevo. Es el mismo criterio que la pantalla de objetivo (un solo activo).

`REUNION_AGENDADA` y `REUNION_REALIZADA` no se pueden poner sin un turno del lead en `appointments`, ni por el PATCH genérico ni por `lead-status`. Un lead nuevo no puede nacer directo en esos dos estados.

```bash
# Catálogo
curl -s "$APP_URL/api/automation/admin" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "X-Agent: mr-pou"

# Leer objetivos (sales_goals). `goals` es el mismo recurso.
curl -s "$APP_URL/api/automation/admin/goals?status=ACTIVA" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "X-Agent: mr-pou"

# Cambiar estado
curl -s -X POST "$APP_URL/api/automation/admin/lead-status" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "agent": "mr-pou", "lead_id": "'"$LEAD_ID"'", "status": "CONTACTADO" }'

# Mensaje con el texto exacto
curl -s -X POST "$APP_URL/api/automation/admin/lead-message" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{ "agent": "mr-pou", "lead_id": "'"$LEAD_ID"'", "sender": "VENDEDOR", "content": "Hola, te escribo por el turno." }'

# Descartar un lead (soft). Sin confirm=true responde 400 y no escribe.
curl -s -X DELETE "$APP_URL/api/automation/admin/leads/$LEAD_ID?confirm=true" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "X-Agent: mr-pou"
```

## Equipo (objetivo y dashboard compartidos, Plan §1.23)

La migración `20261014120000_leads_team.sql` crea las tablas, pero **la membresía se siembra a mano, una sola vez**: la app no puede escribir en `teams` ni en `team_members` (no tienen políticas de escritura) y los mails no se versionan en una migración. En el **SQL Editor** de Supabase, con los dos mails reales:

```sql
with t as (
  insert into public.teams (owner_id, name)
  select id, 'SmokIA' from auth.users where email = 'paggustintomas@gmail.com'
  returning id
)
insert into public.team_members (owner_id, team_id)
select u.id, t.id
from auth.users u, t
where u.email in ('paggustintomas@gmail.com', 'matiassanblas@gmail.com');
```

Verificar con `select * from public.team_members;` (dos filas, el mismo `team_id`). Para sacar a alguien del equipo basta borrar su fila de `team_members`: sus datos no se pierden, sólo dejan de contar en el global. Sin esta siembra la app sigue funcionando como antes (cada uno con su meta y su dashboard).

---

## Notas

- **No usamos Supabase local.** Requiere Docker y la decisión fue trabajar directo contra la nube. Por eso los comandos van con `--linked` y no con `--local`
- **Apify no puede alcanzar `localhost`.** En desarrollo los webhooks nunca llegan y la importación entra por la reconciliación al abrir la pantalla de jobs. Es esperado
- **Instagram es por usuario.** Cada uno conecta su cuenta en `/configuracion` (token de larga duración + id de la cuenta profesional). Si la app de Meta está en modo desarrollo, el socio tiene que estar agregado como tester/rol de la app para poder generar su token
- **Apify cobra por resultado.** Al probar, usar `maxResults` chico (5): cada corrida cuesta plata real
