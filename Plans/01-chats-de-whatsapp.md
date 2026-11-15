# §1.24 — Chats de WhatsApp dentro del CRM (Evolution API, vía no oficial)

## Context
Hoy `lead_messages` se llena a mano o con el copiloto, y el envío ocurre fuera de la app. El usuario quiere ver sus chats de WhatsApp dentro del CRM, para leerlos, hacer seguimiento y responder, y para que el agente del gestor tenga ese contexto.

**Historia de la decisión (2026-10-27 al 2026-10-30).** Se evaluó la Cloud API oficial de Meta con Coexistence. Meta exige que quien arma la integración sea Solution Partner o Tech Provider, así que hace falta un proveedor de pago (ManyChat, 360dialog, Wati). ManyChat lo tiene en beta, sin historial y sin confirmar que lleguen los mensajes escritos desde el celular. El usuario pidió una vía **gratuita** y eligió **Evolution API** (Baileys, vinculación por QR).

Decisiones tomadas:
- **Evolution API autoalojada**, modo Baileys (WhatsApp Web). Gratis, con el número real, historial y mensajes escritos desde el celular.
- **Riesgo asumido por el usuario:** va contra los términos de WhatsApp y el número puede ser baneado. Mitigación: empezar con un **número secundario de prueba** y usar la integración sólo para leer y responder; **nada de prospección en frío** (la prospección sigue manual).
- Sin plantillas ni ventana de 24 h: al no ser la API oficial, esas reglas de Meta no existen. Aun así, el envío sigue siendo sólo respuesta o seguimiento a chats existentes.

## Riesgos abiertos (cerrar en el sub-paso 0)
1. **Dónde corre.** Evolution API necesita un proceso prendido siempre (conexión persistente con WhatsApp), PostgreSQL y Redis recomendado. Vercel no sirve para eso. Candidatos gratuitos a verificar: Oracle Cloud Always Free (la capacidad ARM suele estar agotada), Railway/Fly.io (planes gratuitos con límites), o una PC/Raspberry propia. Ninguno está verificado con Evolution API.
2. **Forma exacta del payload.** La documentación oficial no detalla el esquema de `MESSAGES_UPSERT`. Por reportes de la comunidad: el sobre trae `event`, `instance` y `data`; `remoteJid`, `fromMe` e `id` están en `data.key`; la dirección se decide por `data.key.fromMe`, no por el nombre del evento. El nombre del evento varía por versión (`MESSAGES_UPSERT` o `messages.upsert`). **Se confirma con un payload real de la versión instalada** antes de escribir el parser.
3. **Versión.** Fijar una versión concreta de la imagen (no `latest`) y leer su CHANGELOG antes de actualizar: es un proyecto que cambia sin avisar, igual que los scrapers (CLAUDE.md §5). Repo y docs actuales: `github.com/evolution-foundation/evolution-api` y `docs.evolutionfoundation.com.br` (índice en `/llms.txt`). El CHANGELOG de `main` muestra **2.3.7 (2025-12-05)** como la última; el 2.3.7 arregla justo lo que nos importa (eventos entrantes que dejaban de llegar tras reconectar, mensajes `@lid` descartados, `messages.set` con `isLatest` y `progress` para saber cuándo terminó la sincronización del historial). Confirmar en Releases si hay algo más nuevo y si el proyecto sigue activo.
5. **Docs inconsistentes entre versiones.** La página de envío de la documentación nueva documenta `POST /message/sendText/{instance}` con `textMessage: { text }`, mientras que la v2 anterior usaba `text` plano. La documentación de webhooks no describe el payload, los headers ni ninguna firma: la seguridad del webhook queda en el secreto de la URL. Se resuelven con una instancia real en el sub-paso 0.
4. **Estabilidad de la sesión.** Baileys se desconecta si WhatsApp cambia el protocolo. Hay que mostrar el estado de la conexión en la UI.

## Diseño

### Arquitectura
`Celular (WhatsApp) ⇄ Evolution API (servidor propio) → webhook → /api/whatsapp/webhook (Vercel) → Supabase → Realtime → UI`
y, para enviar, `Server Action → Evolution API (POST /message/sendText/{instance})`.

El esquema, el inbox y las reglas del plan anterior se mantienen. Cambia sólo el borde con el proveedor.

### Datos (migración nueva, skill `agregar-tabla`)
Todas con `owner_id`, RLS, 4 políticas con `(select auth.uid())` y `WITH CHECK`, índices.
- `whatsapp_accounts`: una por owner. `instance_name`, `base_url` de Evolution, API key de la instancia (cifrada con `lib/crypto.ts`), secreto del webhook (cifrado), `status` de la conexión, `display_phone`. Único sobre `instance_name`: el webhook resuelve el owner con esa columna.
- `whatsapp_chats`: `owner_id`, `wa_contact_id` (número sin `@s.whatsapp.net`), `display_name`, `lead_id` nullable, `last_message_at`, `unread_count`. Único `(owner_id, wa_contact_id)`. Los grupos (`@g.us`) se ignoran en la primera versión.
- `whatsapp_messages`: `chat_id`, `wa_message_id` (único, da idempotencia), `direction` (IN/OUT), `origin` (CELULAR | CRM | HISTORIAL), `type`, `body`, `status`, `occurred_at`. Sólo texto; media queda como "[imagen]".

Chats enlazados a leads por `normalizePhone` (`lib/leads/dedupe.ts`). Chats sin lead se muestran igual, con botón "crear lead" (reusa §1.21).

No se duplica en `lead_messages` al principio. Reflejar entrantes para que el copiloto los analice (§1.12) queda para el sub-paso 5.

### Webhook (`app/api/whatsapp/webhook/route.ts`, service role)
Tercera excepción de service role; se documenta en CLAUDE.md §4 junto a la de Apify. **Evolution no firma** los webhooks igual que Meta, así que el esquema de seguridad es el de Apify: secreto compartido.
- La URL lleva `?instance=<nombre>&secret=<secreto>`; se compara con `safeEqual` (`lib/crypto.ts`) contra el secreto de `whatsapp_accounts`, falla cerrado.
- Resolver el owner **desde `whatsapp_accounts` por `instance_name`**, nunca del body; escribir `owner_id` explícito en cada fila.
- Validar el payload con Zod (CLAUDE.md §5) y descartar lo que no tenga la forma esperada. Upsert idempotente por `wa_message_id`.
- Un solo archivo, con el encabezado `⚠️ SERVICE ROLE`. Cambios futuros se revisan a mano.

### Envío (Server Action, cliente con RLS)
- `lib/whatsapp/send.ts` recibe cliente y `ownerId`, como `lib/leads/contact.ts`. Llama a Evolution con el header `apikey` y guarda el mensaje enviado.
- Tras enviar, registra la actividad `WHATSAPP` con `recordLeadContact` para que `last_contacted_at` y el seguimiento sigan funcionando.
- Pequeño retardo y ritmo limitado entre envíos para no parecer un bot (el riesgo de baneo depende del comportamiento).
- Los mensajes escritos desde el celular llegan por el mismo webhook (`fromMe = true`) y se guardan con `origin = CELULAR`.

### UI
- `app/(app)/leads/chats/`: lista de chats a la izquierda (no leídos, última actividad, lead enlazado) y hilo a la derecha. Realtime sobre `whatsapp_messages`. Reusa `Timeline` y `TimelineMessage` (`components/leads/ui/timeline`) y el estilo de `message-thread.tsx`.
- Pestaña "WhatsApp" en la ficha del lead.
- En Configuración: URL de Evolution, instancia, API key, estado de la conexión y el QR si hay que volver a vincular.

### Agente
- `GET /api/automation/leads/:id/chat` y `GET /api/automation/chats`: lectura, filtrada por `AUTOMATION_OWNER_ID` en cada query.
- **El agente no envía directo.** Propone un borrador a la cola de aprobaciones de Operaciones y el envío ocurre cuando el usuario aprueba en la UI.

## Sub-pasos (cada uno con su checklist manual, CLAUDE.md §13)
0. Elegir dónde corre, levantar Evolution API con Postgres (y Redis), vincular el número secundario por QR y **capturar un payload real** de un mensaje entrante y de uno enviado desde el celular. Sin código de la app.
1. Migración + webhook de recepción + `db:types`. Cierra con: un mensaje real queda en la base, sin duplicarse al reenviarse.
2. Inbox `/leads/chats` en solo lectura, con Realtime y no leídos.
3. Envío desde el CRM y mensajes del celular visibles.
4. Enlace con leads, creación de lead desde un chat y pestaña en la ficha.
5. Lectura para el agente, borradores a la cola de aprobaciones y, si se decide, reflejo en `lead_messages`.
6. Importar el historial que Evolution haya sincronizado.

## Archivos
- Nuevos: `supabase/migrations/<ts>_whatsapp.sql`, `app/api/whatsapp/webhook/route.ts`, `lib/whatsapp/{client,send,queries,ingest}.ts`, `app/(app)/leads/chats/*`, `components/leads/whatsapp/*`.
- Se tocan: `CLAUDE.md` (§1 tabla de módulos, §4 excepción del webhook), `.env.example` (sólo si se usa una variable global; las credenciales de Evolution van cifradas en `whatsapp_accounts`, por owner), la pantalla de Configuración y la ficha del lead.
- Reutiliza: `normalizePhone`, `safeEqual`/`encrypt`/`decrypt` (`lib/crypto.ts`), `createAdminClient`, `recordLeadContact`, `authorizeAutomation`.

## Verificación
- `npm run build:verify` y lint tras cada sub-paso (nunca `npm run build`).
- Manual, ítem por ítem, con la skill `checklist-manual`: mensaje entrante real, el mismo payload reenviado no duplica, secreto inválido rechazado con 401, mensaje escrito desde el celular visible en el CRM, envío desde el CRM llega al contacto, estado de conexión visible, aislamiento entre los dos usuarios.
- El webhook necesita una URL pública (Vercel o un túnel): Evolution corre en otro servidor y no alcanza `localhost`.
