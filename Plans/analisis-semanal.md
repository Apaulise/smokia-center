# Análisis semanal

Pantalla en `/operaciones/analisis`, dentro del Gestor de Operaciones. Una pestaña por área y un selector de semana (la más reciente con reporte, o la semana en curso si todavía no hay).

Los números que el CRM ya tiene se calculan al abrir la pantalla. El texto —conclusiones, cambios propuestos y las métricas que el CRM no guarda— lo publica un agente por la API. La pantalla no manda WhatsApp, mails ni ningún otro mensaje: guardar un estado sólo escribe la fila.

Cada cuenta ve lo suyo (`owner_id`, RLS). El socio no ve el análisis del dueño. La API escribe en `AUTOMATION_OWNER_ID`, igual que el resto de `/api/automation/*`.

> **Estado: código en el repo. La migración no está aplicada. Checklist manual pendiente.**

## Áreas

Definidas en `lib/weekly/areas.ts`. Para sumar una: un valor nuevo de `weekly_area` en su propia migración, y una entrada en ese array.

| Área | De dónde salen los números |
|---|---|
| Prospección WhatsApp | Aperturas confirmadas de `lead_messages` (`WHATSAPP`) |
| Prospección por email | Igual, canal `EMAIL` |
| Seguimientos | `kind = SEGUIMIENTO` confirmados, y lo que pasó después en la misma semana |
| Instagram | Cuenta de Marca (`brand_posts`, snapshots de la cuenta y de cada pieza) |
| YouTube | Igual, plataforma `YOUTUBE` |
| X/Threads | No está en el CRM. Sólo lo que publica el agente, marcado como informado |

Un cero es una consulta que volvió vacía. Si la consulta falla, o si no hay cuenta de Marca, o si X/Threads no tiene reporte, la pantalla dice que no hay dato: no muestra un cero.

Reglas que usa el CRM:

- **Real:** el prospecto escribió y el análisis dice `HUMANA`. **Automática:** `AUTORESPUESTA`. Sin análisis queda **Sin clasificar** y no entra en la tasa. El número se muestra igual en cero.
- **No atribuidas:** respuestas de la semana que no se atan a una apertura enviada en esos días. También se muestran en cero.
- **Positiva:** humana, no descalificada, con interés 7 o más (escala 0–10) o con pedido de reunión.
- **Tasa por mensaje:** respuestas reales / aperturas enviadas. Una misma persona que manda tres mensajes suma tres. **Tasa por lead:** leads con apertura que tuvieron al menos una respuesta real / leads con apertura (parte 1). Sin aperturas, la tasa por lead es "—" y el delta dice "sin aperturas". **Tasa positivas:** positivas / reales. Sin respuestas reales, no se muestra.
- El segundo mensaje de una apertura (`APERTURA_M2` o `part: 2`) no suma como enviado ni como seguimiento. En la base sigue siendo `kind = APERTURA` con `analysis.opening.part = 2`, porque el enum no tiene otro valor y no hizo falta una migración.
- **Tabla:** reparte las respuestas que llegaron en la misma semana. El tipo en texto libre sale de `analysis.opening.type`. Si no hay, y tampoco hay ángulo, la fila dice "Sin tipo". `n` es la cantidad de enviados de ese tipo. Con `n` menor a 8 dice "muestra chica".
- **Alerta:** si en la semana un lead pasó a `RESPONDIO` o `AUTORESPUESTA` y no tiene ninguna fila `sender = LEAD` en esa semana, el panel lo nombra. Una nota o un cambio de estado no cuentan como respuesta.
- **Seguimientos:** la respuesta cuenta si llegó en la semana, después de ese mensaje y antes del próximo. Agendó y cerró son lo que pasó en esa ventana. El segundo mensaje de una apertura no entra en esta cuenta.
- **Marca:** seguidores es el último snapshot de la semana. Alcance e interacciones suman los días que tienen snapshot. El alcance de la tabla es el acumulado de la pieza al último sync de esa semana.

## Tabla

Migración: `supabase/migrations/20261030120000_weekly_reports.sql`. **No está aplicada.** `npm run db:push` pega en la base real. Después, `npm run db:types`. Hasta entonces los tipos viven en `lib/weekly/db.ts` y `database.types.ts` no se toca.

`weekly_reports` lleva `owner_id`, RLS `(select auth.uid()) = owner_id` con `WITH CHECK`, e índice único `(owner_id, area, week_start)`. `week_start` es el lunes.

El estado de la conclusión y de cada cambio: `pendiente`, `aprobado`, `en_prueba`, `descartado`, `medido`. Lo edita la UI. La API no lo pisa si ya dejó de estar pendiente.

## Quién publica

Misma autenticación que el resto: `Authorization: Bearer $AUTOMATION_API_SECRET` (32 caracteres o más) y `AUTOMATION_OWNER_ID`. El agente va en `agent` o en `X-Agent`.

| Agente | Áreas |
|---|---|
| `AUTOMATION_ADMIN_AGENTS` (mr-pou) | Todas |
| `AUTOMATION_WEEKLY_AGENTS` | Todas. Variable nueva, opcional. Vacía = nadie extra |
| Alta (`AUTOMATION_WRITE_AGENTS` o, si no está, ventas, seguimiento y julian) | WhatsApp y email |
| Escritura (por defecto ventas y seguimiento) | Seguimientos |

Instagram, YouTube y X/Threads no tienen agente comercial por defecto: los publica mr-pou o alguien listado en `AUTOMATION_WEEKLY_AGENTS`.

No hay otra variable obligatoria. `AUTOMATION_API_SECRET` y `AUTOMATION_OWNER_ID` son las que ya usa la API.

## Payload

`POST /api/automation/weekly-reports`. Idempotente por área + semana: el mismo par actualiza la fila. Las claves van en camelCase o en snake_case.

```bash
curl -s -X POST "$APP_URL/api/automation/weekly-reports" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "X-Agent: mr-pou" \
  -H "Content-Type: application/json" \
  -d '{
    "area": "whatsapp",
    "week": "2026-10-26",
    "conclusions": "La variante 2 de reseñas respondió mejor en peluquerías.",
    "metrics": [
      { "key": "demos", "label": "Demos pedidas", "value": 2, "unit": "count", "note": "contadas a mano" }
    ],
    "changes": [
      {
        "key": "reviews-v2",
        "title": "Dejar la variante 2 como default",
        "detail": "En peluquerías de CABA.",
        "status": "pendiente"
      }
    ]
  }'
```

- `week`: lunes `YYYY-MM-DD` o semana ISO `2026-W44`. No se acepta una semana que no empezó.
- `area`: `whatsapp`, `email`, `seguimientos`, `instagram`, `youtube`, `x_threads`.
- `conclusions`: hasta 8000 caracteres. Puede ir vacío si hay números o cambios.
- `conclusionStatus` / `conclusionResult`: opcionales. En una fila que ya no está pendiente, se ignoran.
- `metrics`: hasta 40. `unit` es `count` (default), `percent` (0 a 100) o `days`. `value` puede ser null. Se muestran aparte de los números del CRM, con la marca "Informado".
- `messageStats`: hasta 40. `type`, `variant` (texto o número), `sent`, y opcionales `realReplies`, `autoReplies`, `positive`. Si el CRM ya armó la tabla de esa área, estos no se muestran. Si el CRM no tiene filas (X/Threads, o una semana sin envíos), se muestran marcados como informados.
- `series`: hasta 7 puntos `{ day, sent, realReplies }`. `day` tiene que caer en la semana. Un día ausente no se dibuja como cero. Sirve para las áreas sin serie en el CRM.
- `changes`: hasta 30. `key` en minúsculas (`reviews-v2`). Republicar actualiza título y detalle. Si el estado ya no es pendiente, se conserva el estado y el resultado. Un cambio pendiente que ya no viene en el payload se borra; uno decidido se queda.

Respuesta:

```json
{ "id": "…", "area": "whatsapp", "week": "2026-10-26", "unchanged": false, "preservedDecisions": 0 }
```

`unchanged: true` cuando el texto ya era el mismo. `preservedDecisions` cuenta estados que la UI ya había movido y esta publicación no tocó.

Sin migración: `503`. Sin secreto, o con uno distinto: `401`. Agente que no corresponde a esa área: `403`.

### Leer

`GET /api/automation/weekly-reports?area=whatsapp&week=2026-10-26`, con `X-Agent`. Sin `week`, lista las últimas (`limit` 1–50, default 20). Sin `area`, sólo un agente admin o de `AUTOMATION_WEEKLY_AGENTS`. Si la semana no tiene fila: `404`.

## Registrar lo que se mandó y lo que contestaron

El panel sólo cuenta filas de `lead_messages`. Una nota o un `RESPONDIO` puesto a mano no es una respuesta. Estas rutas no necesitan migración: el tipo libre y la parte 2 viven en `analysis.opening` de la fila del vendedor, y la respuesta del lead es una fila `sender = LEAD` con el análisis en `analysis.analysis`, que es la forma que ya leía el panel. No se reescriben filas viejas.

### POST `/api/automation/leads/:id/contact`

Sigue sin exigir agente. Campos nuevos, todos opcionales. Un body viejo se registra como antes.

| Campo | Qué es |
|---|---|
| `occurred_at` | Hora real del envío, ISO 8601 con zona. Sin ella, el instante de la carga. Con ella, el mismo texto en ±2 minutos no duplica la fila |
| `kind` | `APERTURA`, `APERTURA_M2` o `SEGUIMIENTO`. Sin `kind` ni `part`, la primera salida confirmada sigue siendo apertura y el resto seguimiento |
| `part` | `1` o `2`. `2` es lo mismo que `APERTURA_M2` |
| `type` | Tipo de apertura, texto libre (hasta 80). Si coincide con un ángulo (`REVIEWS` o "Reputación y reseñas"), también se guarda el enum |
| `variant` | Texto libre o un entero 1–99 |
| `agent` | Opcional, en el body o en `X-Agent`. Si es de prospección (`ventas`, `seguimiento`, `julian`, `email-outreach`, o `AUTOMATION_PROSPECTING_AGENTS`) una `APERTURA` sin `type` ni `opening.angle` responde 400 |

`APERTURA_M2` se guarda como `kind = APERTURA` y `analysis.opening.part = 2`. No lleva ángulo, así el antisesgo no la cuenta dos veces. `GET /api/automation/leads/:id` suma `part` (`1`, `2` o `null`); `kind` en esa respuesta sigue siendo el de la base.

```bash
curl -s -X POST "$APP_URL/api/automation/leads/$LEAD_ID/contact" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "julian",
    "channel": "WHATSAPP",
    "kind": "APERTURA",
    "type": "reseñas peluquería",
    "variant": "v2",
    "occurred_at": "2026-10-28T11:04:00-03:00",
    "content": "Hola, vi que responden las reseñas a mano. ¿Les lleva mucho?"
  }'
```

El segundo mensaje de esa apertura:

```bash
curl -s -X POST "$APP_URL/api/automation/leads/$LEAD_ID/contact" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "agent": "julian",
    "kind": "APERTURA_M2",
    "occurred_at": "2026-10-28T11:05:00-03:00",
    "content": "Lo pregunto porque varias lo resuelven con un mensaje solo."
  }'
```

### POST `/api/automation/leads/:id/reply`

Pide agente (`agent` o `X-Agent`). Sin `AUTOMATION_REPLY_AGENTS`, pueden `seguimiento`, `julian`, `email-outreach`, quien esté en la lista de escritura (`ventas` y `seguimiento` por defecto) y el admin. Una lista explícita reemplaza todo eso.

Si viene `response_type`, no se llama al modelo. Si no viene, corre el analizador de la ficha (Groq, la key de Configuración del owner) y recién ahí se guarda la fila. El mismo texto, canal y hora (±2 minutos) devuelve la fila que ya estaba, con `duplicate: true`, y no vuelve a mover el estado.

| Campo | Qué es |
|---|---|
| `channel` | `WHATSAPP` (default) o `EMAIL` |
| `content` | Lo que escribió el lead |
| `occurred_at` | Hora real. Sin ella, el instante de la carga: un reintento sólo coincide dentro de los 2 minutos |
| `response_type` | `HUMANA` o `AUTORESPUESTA`. Sin él, analiza el servidor |
| `interest_level` | 0–10. Si el agente clasifica y no lo manda, queda 0 |
| `wants_meeting` | Default `false` |
| `disqualify` | `true` mueve a `DESCARTADO`, igual que el motor de estados |

```bash
curl -s -X POST "$APP_URL/api/automation/leads/$LEAD_ID/reply" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "X-Agent: seguimiento" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "WHATSAPP",
    "content": "Sí, me interesa verlo esta semana.",
    "occurred_at": "2026-10-28T14:30:00-03:00",
    "response_type": "HUMANA",
    "interest_level": 8,
    "wants_meeting": true,
    "disqualify": false
  }'
```

Respuesta: `{ "ok": true, "duplicate": false, "leadId", "messageId", "occurredAt", "responseType", "interestLevel", "previousStatus", "status", "analyzed" }`. `analyzed: true` cuando corrió el modelo. Una respuesta de las últimas 48 horas actualiza interés y próxima acción. Una carga más vieja no pisa un interés que el lead ya tenía ni una próxima acción futura. El estado sólo avanza.

Sin `response_type` hace falta la key de Groq. Si falta, 422 y no se inserta nada.

### GET `/api/automation/reconcile?date=YYYY-MM-DD`

No pide agente. El día es calendario de `America/Argentina/Buenos_Aires` (medianoche a medianoche, UTC-3). Por lead: salientes confirmados y entrantes, para cruzarlos con WhatsApp Web. Un borrador del vendedor no sale. Un mensaje del lead entra aunque `confirmed` sea false.

```bash
curl -s "$APP_URL/api/automation/reconcile?date=2026-10-28" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET"
```

```json
{
  "date": "2026-10-28",
  "timezone": "America/Argentina/Buenos_Aires",
  "from": "2026-10-28T03:00:00.000Z",
  "to": "2026-10-29T03:00:00.000Z",
  "truncated": false,
  "totals": { "leads": 1, "outgoing": 2, "incoming": 1 },
  "leads": [
    {
      "id": "…",
      "name": "Peluquería Ana",
      "phone": "+54911…",
      "status": "RESPONDIO",
      "outgoing": [
        { "id": "…", "channel": "WHATSAPP", "kind": "APERTURA", "part": 1, "type": "reseñas peluquería", "variant": "v2", "content": "…", "occurredAt": "…", "responseType": null, "interestLevel": null }
      ],
      "incoming": [
        { "id": "…", "channel": "WHATSAPP", "kind": null, "part": null, "type": null, "variant": null, "content": "Sí, me interesa.", "occurredAt": "…", "responseType": "HUMANA", "interestLevel": 8 }
      ]
    }
  ]
}
```

`kind: "APERTURA_M2"` en esta respuesta es la parte 2. `truncated: true` si el día tiene 2000 mensajes o más.

## Checklist manual

Antes de empezar: entrar con la cuenta del dueño. Los ítems 1 y 2 se pueden ver antes de la migración. Del 3 en adelante hace falta `npm run db:push` y el secreto. Ningún ítem gasta tokens ni llama a Apify.

1. **Sidebar** — Abrir Gestor de Operaciones.
   Esperado: aparece "Análisis semanal" y entra a `/operaciones/analisis`.
2. **Sin migración** — Recorrer las seis áreas.
   Esperado: WhatsApp, email y seguimientos muestran números del CRM (ceros si no hubo movimiento, sin inventar una tasa). Instagram y YouTube avisan si no hay cuenta. X/Threads dice que no está en el CRM. El texto explica que falta la migración. `/leads` y `/marca` siguen abriendo.
3. **Publicar** — Con mr-pou (`AUTOMATION_ADMIN_AGENTS`) hacer el POST de arriba y recargar esa semana.
   Esperado: se ven la conclusión y el cambio en Pendiente. La métrica "Demos pedidas" dice Informado y no se mezcla con los números del CRM. Repetir el POST responde `unchanged: true` y no duplica la fila.
4. **Estado** — Pasar el cambio a En prueba, escribir un resultado y guardar. Recargar. Volver a publicar el mismo `key` con `status: pendiente`.
   Esperado: sigue En prueba, con el resultado. La respuesta trae `preservedDecisions` mayor a 0.
5. **Semana** — Cambiar el selector a la semana anterior.
   Esperado: los números cambian con esa semana. La tasa, si no hubo enviados, es "—" y no 0%.
6. **Aislamiento** — Entrar con la otra cuenta, y repetir el GET sin secreto.
   Esperado: la otra cuenta no ve el análisis. Sin secreto, 401.
7. **Mobile** — Abrir la pantalla en un teléfono.
   Esperado: las áreas se pueden deslizar, la semana se elige, y la tabla se desplaza de costado sin tapar el texto.
