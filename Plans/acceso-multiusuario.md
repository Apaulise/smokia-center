# Acceso multiusuario — login con Google, reset de contraseña por código y app compartida con el socio

> **Estado (2026-10-03):** implementado de punta a punta (código, typecheck, lint y `build:verify`). Pendiente: la configuración manual de Google, Resend y la plantilla de mail (SETUP.md §5–§6), cargar `ALLOWED_EMAILS`, y el checklist manual de abajo, ítem por ítem.
>
> Desvíos menores respecto del plan: `GOOGLE_LOGIN_ENABLED` se borró en vez de ponerse en `true` (Google siempre visible); el provider de marca expone `connect(supabase, ownerId)` que devuelve una `BrandSourceConnection`, en vez de una factory `createInstagramSource`; el cron `sync-marca` toma los owners desde `settings` (los que conectaron Instagram) en vez de `brand_accounts`.

## Contexto

Hoy sólo el dueño usa la app y entra con email y contraseña. Google está apagado (`GOOGLE_LOGIN_ENABLED = false`) y no hay forma de recuperar una contraseña olvidada. El objetivo es que el dueño y su socio usen la misma app, cada uno con sus propios datos: leads, API keys, perfil de vendedor y su propia cuenta de Instagram.

Lo que dice el relevamiento:
- **La base ya aísla por usuario.** Las 31 tablas tienen `owner_id`, RLS y las 4 políticas. Los `unique` son por owner, y `settings` es `unique(owner_id,key)`. No hace falta ninguna migración.
- **Instagram es el único supuesto de un solo usuario.** `lib/meta/client.ts:23` lee `INSTAGRAM_ACCESS_TOKEN` e `INSTAGRAM_USER_ID` del entorno. Hoy, si el socio aprieta "Sincronizar" o "Publicar", lee y publica en la cuenta del dueño, y el cron `sync-marca` le copiaría el Instagram del dueño.
- **El registro está abierto a cualquiera.**

Decisiones del usuario:
- Sólo pueden entrar dos mails (allowlist).
- El reset es con un código de 6 dígitos por mail.
- Los mails salen por SMTP propio (Resend).

Este trabajo es transversal, no un paso de fase, así que se guarda como `Plans/acceso-multiusuario.md`, como el plan de migración. Lleva un checklist manual al final.

---

## 1. Allowlist de mails: `ALLOWED_EMAILS`

- **Nuevo `lib/auth/allowlist.ts`** con `isAllowedEmail(email)`. Lee `ALLOWED_EMAILS` (mails separados por coma), compara en minúsculas y sin espacios. Si la variable falta, falla cerrado: no entra nadie.
- **Dónde se aplica:**
  - **`proxy.ts`:** con sesión válida pero mail fuera de la lista, hace `signOut` y redirige a `/login?error=not_allowed`. Esto cubre también una cuenta de Google ajena que Supabase haya llegado a crear.
  - **`app/auth/callback/route.ts`:** después de `exchangeCodeForSession`, el mismo chequeo con `signOut` y `error=not_allowed`.
  - **Registro:** el `signUp` pasa a una Server Action nueva, `signUpWithEmail` en `app/(auth)/login/actions.ts`, que valida con Zod y con la allowlist antes de llamar a Supabase. `email-form.tsx` usa esa acción para el registro. El sign-in sigue en el cliente, como hoy.
- **`login-screen.tsx`:** un mensaje específico para `not_allowed` ("Esta cuenta no tiene acceso a SmokIA").
- **Archivos de entorno:** sumar `ALLOWED_EMAILS` a `.env.example`. El usuario lo carga en `.env.local` y en Vercel.

## 2. Login con Google

- **`app/(auth)/login/page.tsx`:** `GOOGLE_LOGIN_ENABLED = true` y borrar el comentario de stopgap. El código de `google-button.tsx` y del callback ya existe y no cambia.
- **Configuración manual, que hace el usuario (va documentada en `SETUP.md`):**
  1. **Google Cloud:**
     - Consent screen en modo *Testing*, con los dos mails como test users.
     - OAuth Client ID de tipo Web, con redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
  2. **Supabase → Auth → Providers → Google:** habilitarlo y cargar el client id y el secret.
  3. **Supabase → Auth → URL Configuration:**
     - Site URL de producción.
     - Redirect URLs: `http://localhost:3000/**` y la URL de producción `/**`.
- **Cuenta que ya existe:** si el dueño entra con Google usando el mismo mail con el que ya tiene cuenta, Supabase vincula las dos identidades al mismo usuario (mail verificado). Sus datos no se duplican.

## 3. Reset de contraseña con código

**Flujo**, en una ruta nueva y pública `/recuperar`, con un solo client component de 3 pasos y el layout de `LoginScreen`:
1. **Mail.** La Server Action `requestPasswordReset` valida con Zod y llama a `supabase.auth.resetPasswordForEmail(email)` sólo si el mail está en la allowlist. Siempre contesta lo mismo ("Si el mail tiene cuenta, te llegó un código"), para no revelar qué cuentas existen.
2. **Código.** Se carga con el componente `OTPInput`. Al completarlo, la Server Action `verifyResetCode` llama a `supabase.auth.verifyOtp({ email, token, type: "recovery" })` con el cliente de servidor, que deja las cookies de sesión. Si falla, se muestra el estado de error del OTP y se puede reenviar el código.
3. **Contraseña nueva** (dos campos, mínimo 6 caracteres). La Server Action `updatePassword` hace `requireUser()` y después `supabase.auth.updateUser({ password })`, y redirige a `/leads`.

**Cambios en código:**
- **`proxy.ts`:** sumar `/recuperar` a `PUBLIC_PATHS`. No redirige a `/leads` al usuario logueado, porque después del paso 2 ya hay sesión.
- **`email-form.tsx`:** link "¿Olvidaste tu contraseña?" que va a `/recuperar`.
- **Archivos nuevos:**
  - `app/(auth)/recuperar/page.tsx`
  - `app/(auth)/recuperar/reset-flow.tsx`
  - las acciones en `app/(auth)/recuperar/actions.ts`

**Configuración manual (va en `SETUP.md`):**
- **Supabase → Auth → Email Templates → Reset Password:** el cuerpo muestra `{{ .Token }}` en lugar del link, en español.
- **OTP:** largo 6 y vencimiento de 1 h (Auth → Providers → Email).
- **Supabase → Auth → SMTP:**
  - Resend con host `smtp.resend.com`, puerto 465, usuario `resend` y la API key de Resend como password.
  - Remitente en un dominio verificado en Resend. Sin dominio propio verificado, Resend sólo le manda al mail dueño de la cuenta de Resend, así que el socio no recibiría nada.

## 4. Componente OTP: `components/ui/otp-input.tsx`

- **Encaje en el proyecto:** ya tiene TypeScript, Tailwind v4 (`@tailwindcss/postcss`), `components/ui/` y `cn` en `lib/utils.ts`. No hay `components.json` de shadcn y no hace falta para este componente.
- **Qué se adapta del componente pegado:**
  - Se tipa en TS: props `length`, `onComplete`, `onValueChange`, `disabled`, `error` y `className`, con refs `HTMLInputElement[]`.
  - Las clases de shadcn (`bg-background`, `border-input`, `ring-ring`…) no existen en este proyecto. Se reemplazan por los tokens "Señal y humo", siguiendo el `CONTROL` de `components/leads/ui/field.tsx`:
    - fondo `bg-lm-raised`
    - borde `border-lm-line-strong`
    - foco `border-lm-signal` con la sombra `--color-lm-signal-soft`
    - error `border-lm-danger`
    - dígitos en `font-mono` (JetBrains Mono, la tipografía de números de la marca)
  - Accesibilidad: `autoComplete="one-time-code"` en la primera casilla, `aria-label` por dígito ("Dígito 1 de 6") y `role="group"`.
  - Para limpiar el OTP después de un error, el padre lo remonta con `key`. Así no hace falta estado controlado.
- **Qué se descarta:** `OTPDemo` y `demo.tsx`. Traen su propia paleta clara y `<style jsx global>`, y la app es dark-only (CLAUDE.md §6).
- **Dependencias:** ninguna nueva. Los íconos que hagan falta (por ejemplo `Loader2` o `CheckCircle2`) salen de `lucide-react`, que ya está instalado.

## 5. Instagram por usuario

Las credenciales pasan del entorno a `settings`, cifradas y con key por owner. Es el mismo patrón que las API keys.

- **`lib/settings/constants.ts`:** `INSTAGRAM_CREDENTIALS_SETTING = "instagram_credentials"`. El valor es un JSON `{accessToken, userId}` cifrado con `encrypt()`.
- **`lib/meta/client.ts`:**
  - `getMetaCredentials()` pasa a ser `getMetaCredentials(supabase, ownerId)`, async. Lee `settings` filtrando `.eq("owner_id", ownerId)` explícitamente, así sirve tanto con el cliente de usuario como con el admin del cron.
  - Se borran la lectura de `process.env` y el comentario de "un solo dueño".
  - El mensaje del error 190 pasa a decir "actualizalo en Configuración".
- **`lib/brand/sources/types.ts` e `instagram.ts`:** el provider recibe las credenciales al construirse, con una factory `createInstagramSource(credentials)`, en lugar de leerlas en `credentialsOrThrow()`.
- **`lib/brand/sync.ts`:** `runBrandSync(ownerId)` carga las credenciales de ese owner. Si no hay, sale con el error "Conectá tu Instagram en Configuración".
- **`app/api/jobs/sync-marca/route.ts`:** sigue iterando por owner, ahora con las credenciales de cada uno, y saltea al owner que no tenga.
- **`lib/brand/planner/actions.ts` (`publishPlannerItem`):** usa las credenciales del usuario logueado.
- **`lib/settings/actions.ts`:**
  - `saveInstagramCredentials` valida con Zod y prueba contra Graph (`{userId}?fields=username`) antes de guardar.
  - `deleteInstagramCredentials` borra la conexión.
  - `testInstagramConnection` lee de `settings`.
- **`lib/settings/queries.ts:62`:** el estado de "configurado" sale de `settings`.
- **`components/settings/instagram-connection.tsx`:** pasa a ser un form con token e id de cuenta, más "Probar" y "Desconectar". Sigue el patrón de `components/settings/api-key-form.tsx`.
- **Otros archivos:** sacar `INSTAGRAM_*` de `.env.local` (lo hace el usuario) y de `scripts/check-instagram.mjs`, o dejar ese script leyendo el entorno sólo para diagnóstico local.
- **Migración de datos:** no hay. El dueño pega una vez su token actual en Configuración, y su `brand_accounts` ya existente sigue matcheando por `(owner_id, platform, external_id)`.
- **Meta:** si la app de Meta está en modo desarrollo, el socio tiene que estar agregado como tester o rol de la app para poder generar su token.

## 6. Documentación

- **`CLAUDE.md`:**
  - Nota en §4: la app es multiusuario por diseño y el acceso se limita con `ALLOWED_EMAILS`.
  - Gotcha nuevo: el reset depende de la plantilla con `{{ .Token }}` y del SMTP propio.
- **`SETUP.md`:** los pasos manuales de Google, Resend, la plantilla de mail y `ALLOWED_EMAILS`.
- **Memoria:** actualizar `google-oauth-temporarily-disabled.md`, que queda resuelto.
- **Plan:** guardar este plan como `Plans/acceso-multiusuario.md`.

---

## Verificación

- **Automática:** `npm run typecheck`, `npm run lint` y `npm run build:verify`. Nunca `npm run build`.
- **Checklist manual en la app real, confirmado ítem por ítem:**
  1. Login con Google usando el mail del dueño: entra a `/leads` y ve sus datos de siempre (identidad vinculada, sin cuenta nueva).
  2. Login con Google usando un mail fuera de `ALLOWED_EMAILS`: vuelve a `/login` con "Esta cuenta no tiene acceso".
  3. Crear cuenta por mail con un mail no permitido: rechazado sin mandar mail.
  4. El socio crea cuenta o entra con Google: ve listas, leads, Configuración e Instagram vacíos, no los del dueño.
  5. "¿Olvidaste tu contraseña?":
     - Llega el mail con un código de 6 dígitos por Resend.
     - Un código incorrecto pone el OTP en rojo.
     - Pegar el código correcto lo completa.
     - Se elige una contraseña nueva y entra a `/leads`.
  6. Entrar con la contraseña nueva después de cerrar sesión: ok. La vieja falla.
  7. El dueño pega su token de Instagram en Configuración: "Probar conexión" muestra su @usuario y "Sincronizar" trae sus posts a sus datos de siempre.
  8. El socio, sin token, aprieta Sincronizar: le pide conectar Instagram y no trae nada del dueño. Con su propio token, trae los suyos.
  9. Leads, keys y perfil del vendedor de cada uno quedan separados: lo que carga uno no aparece en el otro.
