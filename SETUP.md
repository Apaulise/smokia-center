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

`/api/automation/*` deja que una automatización (n8n, un script, un agente) lea la cola de leads, pida la apertura generada por la IA y registre los contactos sin pasar por la UI. Usa la service role key y queda atada a **un solo usuario**.

1. Generar el secreto: `openssl rand -hex 32` → `AUTOMATION_API_SECRET` (mínimo 32 caracteres; sin él la API responde 401 a todo)
2. Buscar el UUID del dueño de los leads: Supabase → **Authentication → Users** → columna **UID** del mail → `AUTOMATION_OWNER_ID`. (Alternativa en el SQL Editor: `select id, email from auth.users;`)
3. Cargar las dos en `.env.local` y en Vercel (**Settings → Environment Variables**) y redeployar
4. Toda llamada lleva `Authorization: Bearer $AUTOMATION_API_SECRET`

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/automation/leads` | Cola de leads. Filtros: `status` (coma, default `NUEVO,LISTO`), `industry` (UUID o nombre del rubro), `list`, `city`, `uncontacted=true`, `has_phone` (default `true`), `limit` (default 25, máx. 100) |
| GET | `/api/automation/leads/:id` | Un lead + últimas 20 actividades y mensajes |
| POST | `/api/automation/leads/:id/opening-message` | Apertura de la IA (Groq, la key de Configuración del owner). Si ya se envió una, devuelve esa salvo `?regenerate=true` |
| POST | `/api/automation/leads/:id/contact` | Registra el mensaje enviado (`lead_messages`) + el contacto (timeline, `last_contacted_at`, estado, próxima acción) |
| POST | `/api/automation/leads/:id/status` | Cambio de estado, con el mismo gate de reuniones que la UI |

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
