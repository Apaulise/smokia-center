# §1.25 / §1.26 — Inbox omnicanal vía Zernio (arranca por Instagram)

> **Estado (2026-11-14): §1.25 CERRADO.** Migraciones aplicadas y checklist manual dado por OK por decisión del dueño (2026-11-14), para abrir §1.26. §1.26 se planificó aparte, en [01-chats-seguimiento-y-workflows.md](01-chats-seguimiento-y-workflows.md).
>
> Estado anterior (2026-11-13): implementado de punta a punta (sub-pasos 1 a 6), con código, tests (`npm run test:chats`, 39 en verde) y `build:verify` en ok.
>
> Lo que falta y sólo puede hacer el usuario:
> 1. **Reconectar Instagram en Zernio.** Hoy el token de Meta de `agustinpaulise` está invalidado (error 190: cambio de contraseña o sesión), y por eso Zernio devuelve el listado vacío (`accountsQueried: 0`). El scope `instagram_business_manage_messages` sí está concedido y la conexión es por Instagram Login.
> 2. `npm run db:push` (migraciones `20261113120000_chats.sql` y `20261113130000_chats_team.sql`) y después `npm run db:types`. Tras regenerar tipos se puede borrar `lib/chats/db.ts` (el cruce a mano, como `lib/ops/db.ts`).
> 3. Desplegar con `NEXT_PUBLIC_APP_URL` público: el webhook sólo se registra en Zernio si no es localhost.
> 4. Pegar la API key de Zernio en Configuración → "Inbox de Instagram (Zernio)".
> 5. Para el sub-paso 6: tener el equipo sembrado (SETUP.md → Equipo).

## Qué se construyó y en qué se apartó del plan
- **Sin tabla `webhook_events`.** La idempotencia sale del único `(conversation_id, platform_message_id)` en `messages`: un evento repetido no inserta y el contador de no leídos sólo sube cuando la fila es nueva. Menos tablas, mismo resultado.
- **`channel_secrets` aparte de `channel_accounts`** (API key de Zernio y secreto del webhook cifrados con `lib/crypto.ts`): ningún `select *` de la cuenta puede arrastrarlos a una pantalla.
- **El webhook lo registra la propia app** al conectar (`POST /v1/webhooks/settings`, con un secreto de 32 bytes generado ahí y guardado cifrado). No hay secreto ni URL que cargar a mano. En localhost se omite el registro (Zernio no alcanza la máquina) y los mensajes entran al sincronizar.
- **`conversations.history_synced_at`** (no estaba en el plan): marca qué conversaciones ya trajeron su historial, para que el backfill sea incremental y respete el límite de la API de Zernio (60 pedidos por minuto en el plan más bajo; tope de 25–40 conversaciones por corrida, el resto queda "pendiente" y se retoma).
- **Cron `/api/jobs/chats-sync`** (diario, `vercel.json`): re-barre cada cuenta activa y repara webhooks perdidos, como recomienda la propia documentación de Zernio.
- **Abrir un chat NO manda "visto"** a la persona: los no leídos se ponen en cero sólo en SmokIA.
- **Un mensaje que la persona borra se vacía** (texto y adjuntos) en la base; Zernio conserva el original para moderación.
- **Las respuestas enviadas desde el CRM por el dueño se espejan en `lead_messages`** (canal INSTAGRAM, vendedor, confirmada, tipo RESPUESTA): cuentan como contacto y alimentan seguimiento y métricas (§1.17). Si responde el socio no se espeja, porque no puede escribir sobre los leads del dueño (RLS).
- **Enlace con leads:** automático por `@` al crear la conversación (mismo criterio que el alta del embudo: `instagram_url`, `intake.ig_username`, `dedupe_key`), manual con un buscador, y "Crear lead" reusa `upsertInstagramLead` (cae en "Instagram orgánico" como "Respondió"). Sólo el dueño de la cuenta enlaza.
- **Agente:** `GET /api/automation/chats` y `GET /api/automation/leads/:id/chat` (sólo lectura, filtrados por `AUTOMATION_OWNER_ID`). Para responder, el agente deja un borrador con el `POST /api/automation/ops` que ya existe (`type: approval`, `channel: instagram`) y una persona lo manda desde Chats.
- **Equipo (sub-paso 6):** RLS por membresía, sin service role ni `SECURITY DEFINER` salvo la función `chats_set_sharing` (SECURITY INVOKER: la ejecuta el dueño y RLS decide). Es **opt-in por cuenta** (botón "Compartir con mi socio") y reversible. Detalle y límites en `CLAUDE.md` §4.

## Limitaciones conocidas
- El listado de Zernio devuelve como máximo las 100 conversaciones más recientes y no pagina: lo más viejo se ve sólo si llega un mensaje nuevo.
- Los usuarios (`@`) de conversaciones traídas por la sincronización pueden faltar hasta el primer mensaje nuevo: el listado de Zernio no trae `participantUsername`. Sin `@` no se enlaza ni se crea el lead automáticamente (queda el buscador manual).
- Las URLs de adjuntos de la CDN de Meta expiran: pasado un tiempo el enlace del adjunto deja de abrir.
- **Dato sin verificar con payload real:** que el `id` de cada mensaje del listado de Zernio sea el mismo que `platformMessageId` del webhook (la documentación lo sugiere). Si no coincidieran, la sincronización y el webhook duplicarían mensajes: lo cubre el ítem 8 del checklist.
- **Precio por mensajes de Zernio: sin confirmar.** Los envíos de prueba pueden consumir saldo.
- ManyChat sigue sin tocarse: mientras sea dueño de un hilo, Zernio no puede responder en él (409) y los entrantes llegan como `standby`. La app lo muestra con un aviso en vez de fallar en silencio.

## Context
El usuario quiere centralizar en el CRM el inbox de su cuenta de Instagram y que lo usen él y su socio. La arquitectura elegida (diagrama del 2026-11-13): **Instagram · WhatsApp · TikTok · Email ⇅ Zernio API ⇅ CRM SmokIA en Vercel (bandeja omnicanal, leads, automatizaciones, webhooks y API) ⇅ base del CRM (contactos, mensajes, conversaciones, oportunidades)**.

Hoy el embudo orgánico (comentario con keyword → DM → calificación) corre en ManyChat y sólo los leads calificados llegan al CRM por `POST /api/automation/leads/instagram` ([manychat-instagram-leads.md](manychat-instagram-leads.md)). Los mensajes no se ven en la app.

## Decisiones tomadas (2026-11-13)
1. **Zernio es la única puerta a los canales.** Se usa el SDK `@zernio/node` y la API REST (`/v1/inbox/*`).
2. **ZernFlow (`github.com/zernio-dev/zernflow`, MIT) NO se despliega.** Es una app completa con su propio Supabase, workspaces y service role; no se mezcla con esta base (CLAUDE.md §4). Sirve sólo como **código de referencia** (recepción del webhook, uso del SDK, semántica de los nodos).
3. **Automatizaciones: Workflows y comment automations hospedados en Zernio.** SmokIA los configura y muestra el resultado. No se porta ni mantiene un motor de flujos propio.
4. **Primera entrega: sólo Instagram**, con esquema omnicanal desde el inicio (columna de canal). Email, WhatsApp y TikTok van después, **de a uno** (CLAUDE.md §2).
5. **Inbox compartido por equipo** entre los dos socios, con "quién respondió". Requiere una excepción de RLS por equipo (ver abajo) que se **discute y se documenta en CLAUDE.md §4 antes de implementar el sub-paso 6**.
6. **Oportunidades comerciales = `leads` y su pipeline.** No se crea tabla de oportunidades ni de contactos aparte: las conversaciones se enlazan a `leads` por usuario de Instagram (`leads.intake.ig_username`), teléfono o mail.

## Hechos verificados en la documentación de Zernio (2026-11-13)
- Instagram: listar conversaciones y mensajes, enviar texto, adjuntos (imagen, video, audio, PDF), botones, respuestas rápidas, reacciones, archivar. Al conectar, Zernio re-trae el historial de Meta (hasta 500 conversaciones y 500 mensajes por conversación) sin webhooks y ya leído.
- Webhooks `message.received`, `sent`, `edited`, `deleted`, `read`. Firma `X-Zernio-Signature` = HMAC-SHA256 del body crudo con el secreto que **elegimos nosotros**. Responder 2xx en 5 s, hasta 7 reintentos, puede duplicar: deduplicar por `id` (= `X-Zernio-Event-Id`).
- Ventana de 24 h. Fuera de ella, `messageTag: "HUMAN_AGENT"` + `messagingType: "MESSAGE_TAG"` hasta 7 días del último mensaje del cliente, **sólo para mensajes escritos por una persona** (los workflows lo rechazan). Pasados los 7 días no se puede responder.
- La carpeta de solicitudes de mensaje de Instagram no se puede listar (`400 PLATFORM_LIMITATION`); esos DMs llegan por webhook cuando la persona escribe.
- Si otra app (ManyChat, Instagram Inbox) es dueña del hilo: los entrantes llegan con `metadata.standby: true`, ninguna automatización de Zernio responde y los envíos dan `409 not_thread_owner`. `take` sólo funciona con cuentas conectadas por **Facebook Login**.
- Scope necesario: `instagram_business_manage_messages`. Las cuentas conectadas antes de agosto 2026 necesitan refrescar el registro del webhook en Meta.
- Estado de la cuenta (conector, 2026-11-13): `agustinpaulise` ya está conectada a Zernio; el uso del mes es USD 0 (crédito del free tier). **Método de login y scopes: sin confirmar.**
- Límite de la API de Zernio: 60 / 600 / 1.200 requests por minuto según la cantidad de cuentas. Tarjeta obligatoria antes de la tercera cuenta.

## Riesgos abiertos (cerrar en el sub-paso 0)
1. **ManyChat.** Mientras sea dueño de los hilos, Zernio no puede responder (409) y los entrantes llegan como `standby`. Probar qué pasa realmente. **No** poner a Zernio como app por defecto de la cuenta sin probar: puede romper el embudo vigente.
2. **Precio de los mensajes:** no encontrado en la documentación (sólo el cobro por cuentas). Confirmar en el dashboard de Zernio.
3. **Forma exacta del payload** de `message.received` / `message.sent` en Instagram: capturar uno real antes de escribir el parser.
4. **Login y scope de mensajes** de la cuenta conectada; reconectar si hace falta.
5. **Dos motores:** el workflow de Zernio y ManyChat no pueden estar activos a la vez sobre la misma keyword (doble respuesta). Definir el orden de migración del embudo (§1.26).
6. **Privacidad:** si `agustinpaulise` es una cuenta personal, el socio vería todos los DMs. Confirmarlo antes del sub-paso 6.

## Diseño

### Arquitectura
`Instagram ⇄ Zernio → webhook firmado → /api/zernio/webhook (Vercel) → Supabase → Realtime → UI`, y para enviar `Server Action → API de Zernio`.

Se espeja en Supabase (no se lee de Zernio en cada vista) por: Realtime, no leídos, enlace a leads, contexto para el agente, búsqueda propia y el límite de requests de Zernio.

### Datos (migración nueva, skill `agregar-tabla`)
Todas con `owner_id`, RLS, 4 políticas con `(select auth.uid())` y `WITH CHECK`, índices. Esquema omnicanal:
- `channel_accounts`: una por cuenta conectada. `channel` (`INSTAGRAM` | `WHATSAPP` | `TIKTOK` | `EMAIL`), `zernio_account_id` (único: el webhook resuelve el owner con esta columna), `handle`, `login_method`, `status`. La API key de Zernio va cifrada en `settings` por owner (`lib/crypto.ts`), nunca en variable de entorno global.
- `conversations`: `channel_account_id`, `zernio_conversation_id` (único), `participant_external_id`, `participant_handle`, `participant_name`, `lead_id` nullable, `last_message_at`, `last_inbound_at` (calcula la ventana de 24 h / 7 días), `unread_count`, `status`.
- `messages`: `conversation_id`, `zernio_message_id` (único, da idempotencia), `direction` (IN/OUT), `origin` (CRM | CELULAR | AUTOMATIZACION | HISTORIAL), `sent_by` (usuario del CRM, nullable), `type`, `body`, `attachments` (JSON), `status`, `occurred_at`, `standby` boolean.
- `channel_secrets`: API key y secreto del webhook, cifrados (tabla aparte de `channel_accounts`).

### Webhook (`app/api/zernio/webhook/route.ts`, service role)
Nueva excepción de service role, se documenta en CLAUDE.md §4 junto a Apify. Un solo archivo con encabezado `⚠️ SERVICE ROLE`; cambios futuros se revisan a mano.
- Verifica `X-Zernio-Signature` sobre el **body crudo** con comparación de tiempo constante (`safeEqual`), falla cerrado.
- Resuelve owner desde `channel_accounts` por el id de cuenta, **nunca del body**; escribe `owner_id` explícito.
- Valida con Zod; descarta lo que no tenga la forma esperada. Procesa en línea (es rápido) y responde 5xx ante un error propio para que Zernio reintente; la idempotencia la da el único `(conversation_id, platform_message_id)`.

### Envío (Server Action, cliente con RLS)
`lib/chats/send.ts` recibe cliente y `ownerId`, como `lib/leads/contact.ts`. Dentro de 24 h, envío normal; entre 24 h y 7 días, `HUMAN_AGENT`; pasados los 7 días el compositor se bloquea. Tras enviar registra la actividad `INSTAGRAM` con `recordLeadContact` (el canal ya existe en `lead_messages`, migración `20260926130000`). Ritmo limitado entre envíos.

### UI
- `app/(app)/leads/chats/`: lista a la izquierda (no leídos, última actividad, lead enlazado, ventana restante) e hilo a la derecha. Realtime sobre `messages`. Reusa `Timeline`/`TimelineMessage`.
- Pestaña "Instagram" en la ficha del lead; botón "crear lead" desde un chat sin lead (§1.21).
- Configuración: API key de Zernio, cuenta conectada, estado, secreto del webhook.

### Agente
`GET /api/automation/chats` y `/leads/:id/chat`, filtrados por `AUTOMATION_OWNER_ID`. **El agente no envía:** propone un borrador a la cola de aprobaciones de Operaciones y el envío ocurre cuando el usuario aprueba en la UI.

### Equipo (sub-paso 6)
Modelo de `team_goals`: RLS por membresía de equipo (`team_members`), **sin** service role ni `SECURITY DEFINER`, que lee filas de mensajes de otro usuario. Es una excepción nueva y más sensible que las de §1.23 (devuelve contenido, no conteos): se discute y se documenta en CLAUDE.md §4 antes de escribir la migración. Se guarda `sent_by` para atribuir cada respuesta. Si la decisión cambia, el sub-paso 6 se descarta sin tocar el resto.

## §1.25 — Sub-pasos (cada uno con checklist manual, CLAUDE.md §13)
0. **Sin código de la app.** Confirmar login y scope de mensajes de la cuenta; capturar payloads reales de entrante y saliente; probar el comportamiento con ManyChat prendido (`standby`, 409); confirmar el precio de los mensajes; probar un workflow de Zernio sobre la cuenta.
1. Migración + `db:types` + webhook. Cierra con: un mensaje real queda en la base, sin duplicarse al reenviarse; firma inválida = 401.
2. Importar historial e inbox `/leads/chats` en sólo lectura, con Realtime y no leídos.
3. Envío desde el CRM con ventana de 24 h, `HUMAN_AGENT` y bloqueo a los 7 días.
4. Enlace con leads, crear lead desde un chat y pestaña en la ficha.
5. Lectura para el agente y borradores a la cola de aprobaciones.
6. Acceso del socio: políticas por equipo, "quién respondió" y aislamiento verificado.

## §1.26 — Automatizaciones (después de cerrar §1.25)
Pantalla para ver y activar los workflows y comment automations de Zernio (comentario con keyword → DM → calificación) y migrar el embudo desde ManyChat sin doble respuesta. Los leads calificados siguen entrando por `POST /api/automation/leads/instagram` (agregar el agente correspondiente a `AUTOMATION_INTAKE_AGENTS`). Detalle y sub-pasos se escriben al cerrar §1.25.

## Fuera de alcance (cada uno, un § propio)
- **WhatsApp:** **choca con §1.24**, que eligió Evolution API (gratis, no oficial, con riesgo de baneo). Zernio ofrece la vía oficial (plantillas fuera de 24 h). Decidir cuál antes de arrancar.
- **Email:** Gmail, Outlook e IMAP por Zernio (Gmail exige tarjeta; presupuesto de lecturas por minuto).
- **TikTok:** sólo cuentas Business fuera de la UE, Suiza y Reino Unido, sólo respuestas, hasta 10 mensajes en 48 h.

## Archivos
- Nuevos: `supabase/migrations/<ts>_chats.sql`, `app/api/zernio/webhook/route.ts`, `lib/chats/{client,ingest,send,queries}.ts`, `app/(app)/leads/chats/*`, `components/leads/chats/*`.
- Se tocan: `CLAUDE.md` (§1 tabla de módulos; §4 excepción del webhook y, en el sub-paso 6, la de equipo), Configuración, ficha del lead, `AUTOMATION_INTAKE_AGENTS` (§1.26).
- Reutiliza: `safeEqual`/`encrypt`/`decrypt` (`lib/crypto.ts`), `createAdminClient`, `recordLeadContact`, `authorizeAutomation`, `normalizePhone`.
- Antes de escribir la ruta del webhook, leer la guía de rutas en `node_modules/next/dist/docs/` (esta versión de Next.js cambia convenciones).

## Verificación
- `npm run build:verify` y lint tras cada sub-paso (nunca `npm run build`).
- Manual, ítem por ítem, con la skill `checklist-manual`: mensaje entrante real, mismo evento reenviado sin duplicar, firma inválida rechazada, mensaje saliente desde el CRM llega a Instagram, ventana de 24 h y `HUMAN_AGENT` correctos, bloqueo a los 7 días, estado de conexión visible, aislamiento entre los dos usuarios.
- El webhook necesita una URL pública (Vercel o túnel): Zernio no alcanza `localhost`.

## Checklist manual (CLAUDE.md §13) — §1.25, sub-pasos 1 a 6

Antes de empezar: migraciones aplicadas (`npm run db:push`, `npm run db:types`), Instagram **reconectado en Zernio**, `npm run dev` para los ítems 1 a 7 y 13 a 16, y la app **desplegada con `NEXT_PUBLIC_APP_URL` público** para los ítems 8 a 12. Para el 17 y el 18 hace falta el equipo sembrado y entrar con la cuenta del socio. Un envío real (ítems 10 y 11) puede consumir saldo de Zernio: precio por mensaje sin confirmar.

1. **/leads/chats (sin cuenta conectada)** — entrar antes de pegar la key.
   Esperado: estado vacío "Todavía no conectaste Instagram" con botón a Configuración. (Si falta aplicar la migración, dice cuál y qué comando correr.)
2. **/configuracion → Inbox de Instagram (Zernio)** — pegar una key inventada y tocar Conectar.
   Esperado: mensaje rojo "La API key de Zernio no es válida o fue revocada." y no se guarda nada.
3. **/configuracion** — pegar la key real **con el token de Instagram todavía vencido**.
   Esperado: "Conectada: @agustinpaulise", más el aviso "La cuenta necesita reconectarse en Zernio…"; la cuenta figura "Necesita reconectarse" y no se intenta traer historial.
4. **Zernio + /configuracion** — reconectar Instagram en el dashboard de Zernio y tocar **Verificar**.
   Esperado: "La cuenta está bien conectada y con permiso de mensajes" y el estado pasa a "Conectada".
5. **/configuracion** — tocar **Sincronizar**.
   Esperado: "Listo: N conversaciones · M mensajes nuevos" (y, si N pasa de ~30, un aviso de historial pendiente: volver a tocar lo completa). La cuenta muestra la hora de la última sincronización.
6. **/leads/chats** — abrir una conversación real.
   Esperado: mensajes agrupados por día con hora de Argentina; cada mensaje nuestro dice quién lo mandó ("Vos", "Automatización" o "Desde Instagram u otra app"); el encabezado muestra la ventana; si tenía no leídos, el contador baja a 0 al abrirla. Recargar: el hilo y el 0 siguen igual.
7. **/configuracion** — tocar **Sincronizar** una segunda vez.
   Esperado: "0 mensajes nuevos"; ninguna conversación ni mensaje duplicado en /leads/chats.
8. **Producción — webhook y no duplicados.** Mandar un DM desde otra cuenta de Instagram a la tuya.
   Esperado: aparece en la bandeja en pocos segundos sin recargar, con 1 sin leer, enlazado al lead si el `@` coincide. Después **Sincronizar**: el mensaje NO se duplica (confirma que el `id` del listado de Zernio es el `platformMessageId` del webhook). En Zernio → Webhooks figura "SmokIA inbox" y su botón de prueba da 200.
9. **Firma inválida** — `curl -X POST <app>/api/zernio/webhook -d '{}'` y otra vez con `-H 'X-Zernio-Signature: abc'`.
   Esperado: 401 las dos veces y nada se guarda. Reenviar el mismo evento desde el panel de Zernio (redeliver): sin duplicado.
10. **Responder dentro de 24 h** — en un chat donde el cliente escribió hace menos de 24 h, enviar un texto (probar también Enter y Shift+Enter).
    Esperado: llega a Instagram; en el hilo aparece una sola vez como "Vos"; cuando entra el eco del webhook no se duplica y luego pasa a "Entregado" o "Leído".
11. **Ventana** — (a) chat entre 24 h y 7 días: aviso "sólo mensajes escritos por una persona" y el envío funciona; (b) chat de más de 7 días: el campo no aparece y explica el motivo; (c) una conversación donde la persona nunca escribió: bloqueada.
    Esperado: en los tres casos, el comportamiento descripto, sin error crudo.
12. **ManyChat** — abrir un hilo que hoy maneja ManyChat.
    Esperado: se ven los mensajes, aparece el aviso "Otra app es dueña de este hilo" y, si se intenta enviar, un mensaje en español que lo explica (no un error técnico). No hace falta tocar ManyChat: decidir después qué hacer con el embudo (§1.26).
13. **Leads** — abrir un chat de alguien que ya es lead; ir a su ficha.
    Esperado: el chat muestra el lead enlazado; en la ficha aparece "Chat de Instagram" con los últimos mensajes y "Abrir el chat". Tras responder desde Chats, el mensaje figura en el timeline de la ficha (canal Instagram) y cambia el último contacto.
14. **Leads (sin lead)** — en un chat sin lead: "Crear lead"; en otro: "Enlazar a un lead" buscando por nombre; luego la X para quitar el enlace.
    Esperado: el lead se crea en "Instagram orgánico" como "Respondió" y queda enlazado; el buscador lista leads propios y enlaza; quitar el enlace lo deja sin lead. Si la persona no tiene `@` guardado, "Crear lead" está deshabilitado y explica por qué.
15. **/leads/chats — filtros** — Sin leer, Archivadas, buscador por nombre y por `@`; archivar y restaurar un chat.
    Esperado: cada filtro muestra lo que dice; archivar lo saca de "Todas" y lo muestra en "Archivadas"; si la persona vuelve a escribir, vuelve a "Todas".
16. **Agente** — `GET /api/automation/chats?unread=1` con `Authorization: Bearer $AUTOMATION_API_SECRET`; sin header; y `GET /api/automation/leads/<id>/chat` con un lead propio y con uno de otro owner.
    Esperado: lista con `replyWindow` y `unread`; 401 sin secreto; el chat del lead propio; 404 para el ajeno. Un borrador con `POST /api/automation/ops` (`type: approval`, `channel: instagram`, con `leadId`) aparece en Operaciones → Aprobaciones.
17. **Equipo (cuenta del dueño → cuenta del socio)** — el dueño toca "Compartir con mi socio" (pide confirmación); entrar con el socio.
    Esperado: el socio ve las conversaciones, su Configuración muestra la cuenta como "De tu socio, compartida con vos" **sin** botones de sincronizar, desconectar ni compartir; puede responder y el mensaje lleva su nombre (el dueño lo ve en su hilo); **no** ve nombres de leads del dueño ni los botones de crear/enlazar lead.
18. **Aislamiento y reversa** — el dueño toca "Dejar de compartir"; el socio recarga /leads/chats y abre un enlace `?c=<id>` de una conversación del dueño.
    Esperado: el socio ya no ve nada y el enlace dice "No se encontró esa conversación". Si el socio conecta otra cuenta de Zernio, el dueño no ve esas conversaciones.
19. **Desconectar** — "Desconectar" (pide confirmación).
    Esperado: la cuenta desaparece, /leads/chats vuelve al estado vacío y en Zernio ya no figura el webhook "SmokIA inbox". Reconectar con la key repone todo.

Opcional (no gasta modelo ni Apify):
20. **Cron** — `curl -H "Authorization: Bearer $CRON_SECRET" <app>/api/jobs/chats-sync`.
    Esperado: JSON con una fila por cuenta activa (`conversations`, `messages`, `pending`, `error`); sin header, 401.

Cuando el checklist esté completo, el estado de §1.25 pasa a "cerrado" en este archivo, en `Plans/01-gestor-de-leads.md` y en la fila de `CLAUDE.md` §1.

