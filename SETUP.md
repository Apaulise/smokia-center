# Setup

Pasos manuales que hay que hacer una sola vez. Todo lo demás lo corre la app.

---

## 1. Crear el proyecto en Supabase

1. Entrar a [supabase.com/dashboard](https://supabase.com/dashboard) y crear un proyecto nuevo
   - **Nombre:** `awareness-ai`
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
```

Generar los dos secretos propios:

```bash
openssl rand -base64 32    # APP_ENCRYPTION_KEY  (32 bytes, base64)
openssl rand -hex 32       # CRON_SECRET
```

> **`APP_ENCRYPTION_KEY` no se rota a la ligera.** Cifra el token de Apify guardado en la base; si se pierde o cambia, ese token queda ilegible y hay que volver a cargarlo desde `/configuracion`.

> **`SUPABASE_SERVICE_ROLE_KEY` saltea RLS.** Nunca prefijarla con `NEXT_PUBLIC_`, nunca importarla desde un componente.

## 4. Aplicar el esquema

```bash
npm run db:push     # aplica supabase/migrations/ al proyecto
npm run db:types    # regenera lib/supabase/database.types.ts
```

`db:types` se corre **después de cada migración**. Ese archivo no se edita a mano.

## 5. Login con Google

**En Google Cloud Console** → APIs & Services → Credentials → OAuth 2.0 Client ID (tipo *Web application*):

- **Authorized redirect URI:** `https://<ref>.supabase.co/auth/v1/callback`

**En Supabase** → Authentication → Providers → Google: pegar el Client ID y el Client Secret.

**En Supabase** → Authentication → URL Configuration:

- **Site URL:** `http://localhost:3000` (cambiar a la URL de Vercel al desplegar)
- **Redirect URLs:** agregar `http://localhost:3000/**` y, más adelante, `https://<tu-app>.vercel.app/**`

## 6. Arrancar

```bash
npm run dev
```

---

## Al desplegar en Vercel

1. Cargar las mismas variables de `.env.local` en **Settings → Environment Variables**
2. `NEXT_PUBLIC_APP_URL` pasa a ser la URL real de Vercel — **Apify la usa para el webhook**, así que con `localhost` los resultados nunca vuelven solos
3. Agregar la URL de Vercel a las **Redirect URLs** de Supabase Auth (paso 5)
4. Verificar que la service role key no quedó en el bundle del cliente:
   ```bash
   npm run build && grep -r "service_role" .next/static || echo "limpio"
   ```

---

## Notas

- **No usamos Supabase local.** Requiere Docker y la decisión fue trabajar directo contra la nube. Por eso los comandos van con `--linked` y no con `--local`
- **Apify no puede alcanzar `localhost`.** En desarrollo los webhooks nunca llegan y la importación entra por la reconciliación al abrir la pantalla de jobs. Es esperado
- **Apify cobra por resultado.** Al probar, usar `maxResults` chico (5): cada corrida cuesta plata real
