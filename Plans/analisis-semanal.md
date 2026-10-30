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

- **Real:** el prospecto escribió y el análisis dice `HUMANA`. **Automática:** `AUTORESPUESTA`. Sin análisis queda "sin clasificar" y no entra en la tasa.
- **Positiva:** humana, no descalificada, con interés 7 o más (escala 0–10) o con pedido de reunión.
- **Tasa de respuesta:** respuestas reales / enviados. **Tasa positivas:** positivas / reales. Sin enviados, la tasa no se muestra.
- **Tabla:** reparte las respuestas que llegaron en la misma semana. `n` es la cantidad de enviados de ese tipo. Con `n` menor a 8 dice "muestra chica".
- **Seguimientos:** la respuesta cuenta si llegó en la semana, después de ese mensaje y antes del próximo. Agendó y cerró son lo que pasó en esa ventana.
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
