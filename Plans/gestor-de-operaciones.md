# Gestor de Operaciones

Tablero del estado del negocio en `/operaciones`, al lado de Leads y Marca. Los números de prospección, reuniones y contenido salen de los datos que ya están en Supabase. El estado de los agentes, la cola de borradores y los hallazgos del Auditor los escribe Mr. Pou por la API de automatización.

La pantalla **no envía WhatsApp, mails ni ningún otro mensaje**. Aprobar, editar y saltar sólo cambian `decision` en la base y dejan el evento en `history`. Quien manda el mensaje, si corresponde, es el orquestador, después de leer lo aprobado.

> **Estado (2026-10-23): implementado. La migración no está aplicada. Checklist manual pendiente.**

## Pantallas

| Ruta | Qué muestra |
|---|---|
| `/operaciones` | KPIs (7d / 30d), lo que espera OK, bloqueos, estado por área y hasta tres hallazgos |
| `/operaciones/aprobaciones` | Cola. Aprobar, editar o saltar |
| `/operaciones/areas` | Tareas por área y estado |
| `/operaciones/auditor` | Hasta tres hallazgos abiertos, y el historial |

El contador de Aprobaciones en el sidebar es la cantidad de filas con `decision = pending`.

## KPIs (datos que ya existían)

| KPI | De dónde sale |
|---|---|
| Contactados | Contactos del período (`leads_daily_contacts` + seguimientos confirmados) contra el objetivo de `sales_goals`, si hay uno |
| Respuestas | Mensajes de `lead_messages` con `sender = LEAD` en el período |
| Reuniones | Turnos `AGENDADA` o `CONFIRMADA` que empiezan en los próximos 7 o 30 días |
| Contenido en cola | `brand_content_items` que no están `PUBLICADO`, partidos en Instagram y YouTube |
| Necesita tu OK | Aprobaciones `pending` |

Si todavía no se aplicó la migración, los cuatro primeros se ven igual y el quinto muestra "falta la migración". El resto de la app no se cae.

## Tablas

Migración: `supabase/migrations/20261023120000_ops_schema.sql`.

Las tres llevan `owner_id`, RLS `(select auth.uid()) = owner_id` con `WITH CHECK` en insert y update, e índice por `owner_id`. El upsert de la API usa `(owner_id, external_id)`.

| Tabla | Para qué | La escribe |
|---|---|---|
| `ops_status` | Tarea de un agente: área, título, detalle, `estado` (`hecho` \| `pendiente` \| `bloqueo`) | Agentes, vía Mr. Pou |
| `ops_approvals` | Borrador. `decision`: `pending` \| `approved` \| `edited` \| `skipped`. `final_body` es el texto aprobado. `history` guarda cada decisión | Mr. Pou crea; la UI decide |
| `ops_improvements` | Hallazgo del Auditor. `status`: `abierta` \| `aplicada` \| `descartada`. `impact`: `alto` \| `medio` \| `bajo` | Auditor, vía Mr. Pou |

`ops_approvals.lead_id` apunta a `leads` y puede ser nulo. Si viene un id, tiene que ser un lead de ese owner.

Están en la publicación `supabase_realtime` para que la cola se actualice sin recargar.

Los tipos de esas tablas viven en `lib/ops/db.ts` hasta correr `npm run db:types` **después** de aplicar la migración. `database.types.ts` no se editó a mano.

## API

Misma autenticación que `/api/automation/leads`: header `Authorization: Bearer $AUTOMATION_API_SECRET` y todo atado a `AUTOMATION_OWNER_ID`. No hace falta una variable nueva.

Las claves se aceptan en camelCase o en snake_case. Los ejemplos usan camelCase. Un `externalId` repetido actualiza la misma fila: un reintento no duplica. Si la aprobación ya no está `pending`, el reintento responde `unchanged: true` y no pisa la decisión.

### POST `/api/automation/ops`

Estado de una tarea:

```bash
curl -s -X POST "$APP_URL/api/automation/ops" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "status",
    "externalId": "julian-lote-2026-10-23",
    "area": "prospeccion",
    "agent": "Julián",
    "title": "Lote semanal de aperturas",
    "detail": "42 contactados de 50",
    "estado": "hecho",
    "needsOk": false,
    "occurredAt": "2026-10-23T14:20:00-03:00"
  }'
```

`area` de una tarea: `prospeccion`, `ventas`, `instagram`, `youtube`. `estado`: `hecho`, `pendiente`, `bloqueo`.

Borrador para la cola:

```bash
curl -s -X POST "$APP_URL/api/automation/ops" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "approval",
    "externalId": "segui-pedicuros-2026-10-23",
    "leadName": "Pedicuro'\''s",
    "leadId": "00000000-0000-4000-8000-000000000000",
    "channel": "whatsapp",
    "agent": "Seguimiento",
    "reason": "Respondió la apertura · ventana de 24 h abierta",
    "draftBody": "¡Hola! Soy Agustín de Smokia. ¿Te sirve una demo de 15 min esta semana?",
    "occurredAt": "2026-10-23T16:05:00-03:00"
  }'
```

`leadId` es opcional. Si viene, el lead tiene que ser del owner de la API; si no, responde 400. `channel`: `whatsapp`, `email`, `instagram`. La fila nace `pending`.

Hallazgo del Auditor:

```bash
curl -s -X POST "$APP_URL/api/automation/ops" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "improvement",
    "externalId": "aud-peluquerias-telefonos",
    "area": "prospeccion",
    "title": "Enriquecer antes de mandar el próximo lote",
    "body": "12 de 50 leads de Peluquerías CABA no tienen teléfono válido.",
    "impact": "medio",
    "impactScore": 55,
    "status": "abierta",
    "weekLabel": "SEMANA 43"
  }'
```

`area` de un hallazgo también puede ser `operaciones` o `auditor`. `impact`: `alto`, `medio`, `bajo`. `impactScore` (0–100) es opcional y mueve la barra; si no viene, alto = 85, medio = 55, bajo = 30.

Respuesta:

```json
{ "id": "…", "externalId": "aud-peluquerias-telefonos", "type": "improvement", "unchanged": false }
```

Sin migración aplicada: `503` con `"Falta aplicar la migración de Operaciones."`. Sin secreto, o con uno distinto: `401`.

### GET `/api/automation/ops/approvals?decision=approved`

Para que Mr. Pou lea lo que ya se decidió y, fuera de esta app, haga lo que corresponda. `decision` puede ser `pending`, `approved`, `edited` o `skipped`. Si no se manda, el default es `approved`. `limit` (1–100, default 50). `since` filtra por `decidedAt`.

```bash
curl -s "$APP_URL/api/automation/ops/approvals?decision=approved" \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET"
```

```json
{
  "count": 1,
  "approvals": [
    {
      "id": "…",
      "externalId": "segui-pedicuros-2026-10-23",
      "leadId": "…",
      "leadName": "Pedicuro's",
      "channel": "whatsapp",
      "agent": "Seguimiento",
      "reason": "Respondió la apertura · ventana de 24 h abierta",
      "draftBody": "Texto original",
      "finalBody": "Texto que quedó aprobado, editado o null si se saltó",
      "decision": "approved",
      "decidedAt": "2026-10-23T19:40:00.000Z",
      "occurredAt": "2026-10-23T19:05:00.000Z"
    }
  ]
}
```

El texto a usar es `finalBody` cuando la decisión es `approved` o `edited`.

## Qué hay que hacer a mano

1. Aplicar la migración en el proyecto de Supabase: `npm run db:push`. Impacta la base real. No se corrió desde acá.
2. Regenerar tipos: `npm run db:types`. Después se puede dejar de usar el puente de `lib/ops/db.ts` si los tipos generados coinciden.
3. Confirmar que en Vercel ya están `AUTOMATION_API_SECRET` (32 caracteres o más) y `AUTOMATION_OWNER_ID` (uuid del usuario dueño). No hay variables nuevas.
4. Recorrer el checklist de abajo en la app real.

## Checklist manual

Antes de empezar: entrar con la cuenta del dueño. Los ítems 1 a 3 se pueden ver antes de aplicar la migración. Del 4 en adelante hace falta `npm run db:push` y el secreto de automatización. Ningún ítem gasta tokens ni llama a Apify.

1. **Inicio (`/`)** — Abrir el Gestor de Operaciones desde la tarjeta.
   Esperado: entra a `/operaciones`. El sidebar muestra Resumen, Aprobaciones, Áreas y Auditor, con el ícono de actividad.
2. **`/operaciones`, sin migración** — Mirar la franja de KPIs y el aviso de abajo.
   Esperado: Contactados, Respuestas, Reuniones y Contenido en cola salen de Leads y Marca (ceros si no hay datos, sin pantalla en blanco). Necesita tu OK dice "—". Un aviso dice que falta la base de Operaciones. `/leads` y `/marca` siguen abriendo.
3. **`/operaciones/aprobaciones`, `/operaciones/areas` y `/operaciones/auditor`, sin migración** — Abrir las tres.
   Esperado: cada una explica que falta la migración, en español, sin un error de servidor.
4. **API, un estado** — Con el secreto, hacer el POST `type: status` de arriba y recargar `/operaciones` y `/operaciones/areas`.
   Esperado: la tarea aparece en el área que se mandó, con el estado (Hecho, Pendiente o Bloqueo). Repetir el mismo `externalId` no crea una segunda fila.
5. **API, un borrador** — POST `type: approval` con un `leadId` real del dueño, o sin `leadId`.
   Esperado: el borrador está en Aprobaciones con "Espera tu OK". El contador del sidebar suma 1. En Resumen, la sección Necesita tu OK lo lista. El KPI Necesita tu OK coincide con ese número.
6. **Aprobar sin editar** — En `/operaciones/aprobaciones`, Aprobar. Recargar. En las herramientas de red del navegador, mirar que el click no llame a WhatsApp, mail ni a otro dominio.
   Esperado: el badge pasa a Aprobado y el texto dice que quedó registrado y que desde acá no se envía. Sigue así después de recargar. `decision` en la base es `approved` y `history` tiene el evento.
7. **Editar y aprobar** — Con otro borrador, Editar, cambiar el texto y Aprobar versión editada. Recargar.
   Esperado: se ve el texto nuevo, el badge Aprobado y el chip Editado. En la base, `decision` es `edited` y `final_body` es el texto nuevo.
8. **Saltar y volver** — Saltar un borrador, recargar, y después Volver a la cola.
   Esperado: primero queda Saltado (el texto en gris). Después de volver, otra vez Espera tu OK. Cada paso queda en `history`.
9. **Deshacer** — Aprobar uno y tocar Deshacer.
   Esperado: vuelve a Espera tu OK. No se mandó ningún mensaje.
10. **GET de lo aprobado** — `GET /api/automation/ops/approvals?decision=approved`.
    Esperado: vienen sólo las filas aprobadas de ese owner, con `finalBody`. Un POST del mismo `externalId` responde `unchanged: true` y no vuelve la fila a pending.
11. **Aislamiento** — Repetir el GET sin secreto, y con un `leadId` de otro usuario si existe.
    Esperado: sin secreto, 401. Con lead ajeno, 400 y no se crea la fila. Entrando con la otra cuenta, no se ven las tareas ni los borradores del dueño.
12. **Auditor** — POST `type: improvement` cuatro veces, tres con impacto alto y una con bajo.
    Esperado: en `/operaciones/auditor` se ven tres abiertos (los de más impacto) y el cuarto en el historial. Resumen muestra esos tres y el link Ver todo.
13. **Áreas, filtro vacío** — En `/operaciones/areas`, elegir un área y el estado Bloqueo si esa combinación no tiene filas.
    Esperado: "Nada con ese estado en esta área." y el botón Ver todo vuelve a la lista completa.
14. **En vivo** — Con la cola abierta, mandar otro POST `type: approval`.
    Esperado: el borrador aparece sin recargar a mano, y el contador del sidebar se actualiza.

Empezamos por el 1: decime ok, falla o diferido.
