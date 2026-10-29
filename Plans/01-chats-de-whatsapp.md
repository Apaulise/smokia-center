# §1.24 — Chats de WhatsApp dentro del CRM (Cloud API + Coexistence)

## Context
Hoy `lead_messages` se llena a mano o con el copiloto, y el envío ocurre fuera de la app. El usuario quiere ver sus chats de WhatsApp dentro del CRM, para leerlos, hacer seguimiento y responder, y para que el agente del gestor tenga ese contexto. Decisiones ya tomadas:
- Número propio, migrado a **WhatsApp Business** con **Coexistence** (confirmó que está disponible en Argentina). El celular sigue funcionando.
- **Nada de prospección en frío por la API.** La prospección sigue manual. La API se usa para recibir, leer y responder dentro de la ventana de 24 h.
- Sin verificación de empresa por ahora.

Es una pata nueva dentro de Leads (reabre el plan 01). Un solo paso §1.24, con sub-pasos y checklist manual por ítem (CLAUDE.md §13).

## Riesgos a cerrar antes de escribir código (sub-paso 0, sin código)
1. **¿Se puede hacer Embedded Signup con coexistence sin ser Tech Provider ni tener la empresa verificada?** No lo pude confirmar. Si no se puede, la alternativa es un proveedor (360dialog/Twilio) como intermediario, que cambia el cliente HTTP pero no el esquema ni la UI.
2. Los nombres exactos de los campos del webhook de coexistence (`history`, `smb_app_state_sync`, `smb_message_echoes`) y la firma `X-Hub-Signature-256` se verifican contra la doc de Meta al implementar. No los doy por seguros.

## Diseño

### Datos (migración nueva, `agregar-tabla` para cada una)
Todas con `owner_id`, RLS, 4 políticas con `(select auth.uid())` y `WITH CHECK`, índices.
- `whatsapp_accounts`: una por owner. `phone_number_id`, `waba_id`, `display_phone`, token cifrado con `lib/crypto.ts` (mismo patrón que `settings`). Índice único sobre `phone_number_id`: el webhook resuelve el owner con esa columna.
- `whatsapp_chats`: `owner_id`, `wa_contact_id` (número), `display_name`, `lead_id` nullable, `last_message_at`, `last_inbound_at` (para la ventana de 24 h), `unread_count`. Único `(owner_id, wa_contact_id)`.
- `whatsapp_messages`: `chat_id`, `wa_message_id` (único, da idempotencia), `direction` (IN/OUT), `origin` (APP | API | HISTORIAL), `type`, `body`, `status`, `occurred_at`. Sólo texto en la primera versión; media queda como "[imagen]" sin descargar.

Los chats se enlazan a un lead por `normalizePhone` (`lib/leads/dedupe.ts`). Los chats sin lead se muestran igual, con un botón "crear lead" (reusa el alta manual de §1.21).

**No se duplica en `lead_messages` al principio.** La ficha del lead lee su chat de `whatsapp_messages`. Reflejar entrantes en `lead_messages` para que el copiloto los analice (§1.12) queda para el sub-paso 5, porque ahí hay que decidir qué hace el análisis automático.

### Webhook (`app/api/whatsapp/webhook/route.ts`, service role)
Es la tercera excepción a las reglas de datos y se documenta en CLAUDE.md §4 junto con la de Apify. A diferencia de Apify, **Meta sí firma**:
- `GET`: handshake con `hub.verify_token`.
- `POST`: verificar `X-Hub-Signature-256` (HMAC-SHA256 del body crudo con el app secret) con `safeEqual` de `lib/crypto.ts`, falla cerrado. Responder rápido 200.
- Resolver el owner **desde `whatsapp_accounts` por `phone_number_id`**, nunca del body, y escribir `owner_id` explícito en cada fila. Upsert idempotente por `wa_message_id`.
- Un solo archivo, con el encabezado `⚠️ SERVICE ROLE` como el de Apify. Cambios futuros se revisan a mano.

### Envío (Server Action, cliente con RLS)
- `lib/whatsapp/send.ts`: recibe cliente y `ownerId`, igual que `lib/leads/contact.ts`.
- Bloquea si `last_inbound_at` tiene más de 24 h (sin plantillas en esta versión) y lo explica en la UI.
- Tras enviar, registra la actividad `WHATSAPP` vía `recordLeadContact` para que `last_contacted_at` y el seguimiento sigan funcionando.
- Los mensajes escritos desde el celular llegan por el eco de coexistence y se guardan con `origin = APP`.

### UI
- Ruta `app/(app)/leads/chats/`: lista de chats a la izquierda (no leídos, última actividad, lead enlazado) y hilo a la derecha. Realtime sobre `whatsapp_messages`, como el progreso de `scrape_jobs`.
- Reusa `Timeline` y `TimelineMessage` de `components/leads/ui/timeline` y el estilo de `message-thread.tsx`. Sigue la convención de marca (dark-only, cyan = acción).
- Pestaña "WhatsApp" en la ficha del lead.
- Conexión de la cuenta en Configuración (`lib/settings`), con el token cifrado.

### Agente
- `GET /api/automation/leads/:id/chat` y `GET /api/automation/chats`: lectura, filtrada por `AUTOMATION_OWNER_ID` en cada query (`lib/automation/*`).
- **El agente no envía directo.** Propone un borrador a la cola de aprobaciones de Operaciones y el envío real ocurre cuando el usuario aprueba en la UI. Coincide con la regla actual de que los endpoints de Operaciones no mandan WhatsApp.

## Sub-pasos (cada uno con su checklist manual)
0. Alta en Meta, pasar a WhatsApp Business, conectar con coexistence y resolver los dos riesgos. Sin código.
1. Migración + webhook de recepción + `db:types`. Cierra con: un mensaje real desde otro celular queda en la base.
2. Inbox `/leads/chats` en solo lectura, con Realtime y no leídos.
3. Envío dentro de la ventana de 24 h y eco de los mensajes del celular.
4. Enlace con leads, creación de lead desde un chat y pestaña en la ficha.
5. Lectura para el agente, borradores a la cola de aprobaciones y, si se decide, reflejo en `lead_messages`.
6. Sincronización del historial de 6 meses (la onboarding de coexistence la ofrece una sola vez, así que se decide antes de conectar).

## Archivos
- Nuevos: `supabase/migrations/<ts>_whatsapp.sql`, `app/api/whatsapp/webhook/route.ts`, `lib/whatsapp/{client,send,queries,ingest}.ts`, `app/(app)/leads/chats/*`, `components/leads/whatsapp/*`, `Plans/01-gestor-de-leads.md` (§1.24) y este plan copiado a `Plans/`.
- Se tocan: `CLAUDE.md` (§1 tabla de módulos, §4 excepción del webhook), `.env.example` (`WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`), la pantalla de Configuración y la ficha del lead.
- Reutiliza: `normalizePhone` (`lib/leads/dedupe.ts`), `safeEqual`/`encrypt`/`decrypt` (`lib/crypto.ts`), `createAdminClient`, `recordLeadContact` (`lib/leads/contact.ts`), `authorizeAutomation` (`lib/automation/auth.ts`).

## Verificación
- `npm run build:verify` y lint tras cada sub-paso (nunca `npm run build`).
- Manual, ítem por ítem, con la skill `checklist-manual`: mensaje entrante real, mismo mensaje reenviado por Meta sin duplicarse, firma inválida rechazada con 401, respuesta fuera de ventana bloqueada, mensaje enviado desde el celular visible en el CRM, aislamiento entre los dos usuarios.
- Para probar el webhook en local hace falta un túnel (Meta no alcanza `localhost`, igual que Apify), o probar directo en Vercel.
