# Webhooks de Zernio y Cal.com

Los dos endpoints viven en la API de automatización. No usan el Bearer de `AUTOMATION_API_SECRET`: cada uno verifica el HMAC-SHA256 del body crudo. El dueño de las filas es `AUTOMATION_OWNER_ID` (el mismo de `/api/automation/leads`). Sin el secreto, o con uno de menos de 32 caracteres, responden 401.

No envían WhatsApp ni mail. Sólo escriben leads, conversaciones y turnos.

## Variables en Vercel

Cargarlas en **Settings → Environment Variables** y redeployar. Generar cada una con `openssl rand -hex 32`.

| Variable | Para qué |
|---|---|
| `ZERNIO_WEBHOOK_SECRET` | Firma de `POST /api/automation/webhooks/zernio` (`X-Zernio-Signature`, o el legado `X-Late-Signature`) |
| `CAL_WEBHOOK_SECRET` | Firma de `POST /api/automation/webhooks/cal` (`X-Cal-Signature-256`) |
| `AUTOMATION_OWNER_ID` | UUID del dueño. Ya existe. Sin un UUID válido el webhook responde 500 |

## Migración (antes de apuntar los webhooks)

El archivo es `supabase/migrations/20261125120000_crm_inbound_webhooks.sql`. **No está aplicada.** Suma `webhook_deliveries` (un reintento no duplica), deja `automation_runs.automation_id` en null para los workflows que no son una pieza, y guarda en `appointments` el `uid` de Cal.com más `utm_source` / `utm_campaign`.

Aplicarla a mano contra el proyecto `jrvfbfsoojbvluuinxdm` cuando se revise el SQL (`npm run db:push` pega en la base real). Después, `npm run db:types`. Hasta entonces los endpoints responden 503.

## Zernio

URL: `https://smokia-center.vercel.app/api/automation/webhooks/zernio`

En Zernio, **Settings → Webhooks** (o `POST /v1/webhooks/settings`): un endpoint con el mismo secreto que `ZERNIO_WEBHOOK_SECRET` y estos eventos:

- `contact.tag_added`
- `contact.field_changed`
- `workflow.run.started`
- `workflow.run.completed`
- `workflow.run.failed`

La firma es el HMAC-SHA256 hex del body crudo. Documentación: [contact.tag_added](https://docs.zernio.com/webhooks/inbox/contact-tag-added), [contact.field_changed](https://docs.zernio.com/webhooks/inbox/contact-field-changed), [workflow.run.completed](https://docs.zernio.com/webhooks/inbox/workflow-run-completed).

Qué hace con un contacto de Instagram:

| Señal | Estado del lead |
|---|---|
| Tag `negocio` | `RESPONDIO` |
| Respuesta del campo `tarea`, `tareas` o `tarea_libre` | `DIAGNOSTICO` |
| Tag `intervenir` | `INTERESADO`, con `next_action_at` en este momento: Agustín tiene que responder a mano y el lead entra a la cola de seguimiento |
| Tag `agenda` | `REUNION_PROPUESTA` (compatibilidad con etiquetas viejas; la reserva en sí la escribe Cal.com) |
| Tag `no_agenda` | `CERRADO_PERDIDO`. No pisa una reunión ya agendada, una propuesta ni un cierre ganado |

El lead queda con `acquisition_source = instagram_organico`, el @ en `instagram_url` y la lista "Instagram orgánico". Se busca por el contacto de Zernio y por el @, así un reintento no duplica. La conversación recibe `lead_id`. `workflow.run.*` escribe `automation_runs` (aunque el workflow no sea una pieza) y, si el workflow está en `content_automations`, `conversations.source_automation_id`.

El webhook del inbox (`/api/zernio/webhook`, secreto por cuenta) también pasa estas señales al CRM. Conviene igual el endpoint de arriba: es el que tiene el secreto de Vercel y el que hay que suscribir a `contact.field_changed` si la conexión vieja no lo incluye. Suscribir los dos no duplica: el `id` del evento entra una sola vez.

`listo_agustin` ya no se ingesta. El handoff es `intervenir`.

Los eventos anteriores no se reescriben solos. Para enganchar una conversación vieja hay que volver a poner la etiqueta en Zernio.

Payloads de ejemplo: `tests/fixtures/crm-webhooks/`.

## Cal.com

URL: `https://smokia-center.vercel.app/api/automation/webhooks/cal`

En Cal.com, el webhook del evento de [smokia.site/agendar](https://www.smokia.site/agendar):

1. Subscriber URL = la URL de arriba
2. Secret = el mismo valor que `CAL_WEBHOOK_SECRET` (si queda vacío, Cal manda `no-secret-provided` y el endpoint responde 401)
3. Triggers: `Booking created`, `Booking cancelled`, `Booking rescheduled`, `Meeting ended`

La firma va en `X-Cal-Signature-256`: HMAC-SHA256 hex del body tal cual llegó. Documentación: [Webhooks](https://cal.com/docs/developing/guides/automation/webhooks). `MEETING_ENDED` viene plano (sin `payload`); el resto trae la reserva adentro de `payload`.

| Evento | Turno | Lead |
|---|---|---|
| `BOOKING_CREATED` | `AGENDADA` | `REUNION_AGENDADA` |
| `BOOKING_RESCHEDULED` | actualiza horario y uid; sigue `AGENDADA` | `REUNION_AGENDADA` si todavía no había llegado |
| `BOOKING_CANCELLED` | `CANCELADA` | no baja de estado; queda una nota |
| `MEETING_ENDED` | `REALIZADA` | `REUNION_REALIZADA` si no está más adelante |

El lead se busca por @ de Instagram (si la reserva trae `instagram` / `ig` en las respuestas o en `metadata`), después por email, teléfono y nombre. Si no hay ninguno, se crea: en "Instagram orgánico" cuando hay @, si no en la lista "Cal.com". `metadata.utm_source` y `metadata.utm_campaign` se guardan en el turno y en `intake.utm`. El `uid` de Cal.com hace que un reintento no duplique el turno.

## Verificación

```bash
npm run test:automation
```

Cubre los payloads de `tests/fixtures/crm-webhooks/` (tags, tareas, corrida de workflow, reserva, reprogramación, cancelación y fin de reunión) más la firma. No pega a Zernio, Cal.com ni a la base de producción.
