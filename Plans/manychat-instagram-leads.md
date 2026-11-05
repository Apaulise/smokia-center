# Leads de Instagram (ManyChat) → Smokia Center

> Plan para implementar en local con Claude Code. Va en `Plans/manychat-instagram-leads.md` del repo.
> Contexto: el embudo orgánico de Instagram (comentario con keyword → DM → calificación) corre en ManyChat y hoy ningún lead llega al CRM. Gestionarlos en la interfaz de ManyChat es incómodo. Objetivo: que cada lead de negocio que responde el flujo aparezca en Smokia Center, sin duplicados, con su origen medible.

Antes de escribir código leer `CLAUDE.md` (§4 reglas de datos y la API de automatización) y `AGENTS.md` (esta versión de Next.js tiene cambios: leer la guía en `node_modules/next/dist/docs/`).

## Estado (2026-11-05)

Implementados y verificados en local contra la base real: migración `20261105120000_instagram_intake.sql` (aplicada), endpoint `POST /api/automation/leads/instagram`, `AUTOMATION_INTAKE_AGENTS`, bloque "Instagram" en la ficha y `tests/automation-instagram-intake.test.mjs`. Checklist manual (alta, idempotencia, subida de estado, no retroceso, ficha, 401/403/400, limpieza): 7 de 7 en ok.

Cambios respecto del plan original:
- Los leads nuevos caen en una lista fija **"Instagram orgánico"** (fuente INSTAGRAM, se crea sola) en vez de `lead_list_id = null`, porque la UI sólo muestra leads por lista. Por eso no se construyó el filtro "Origen". Un lead de prospección en frío que se enriquece conserva su lista y su origen (`acquisition_source` sólo se escribe al crear).

Pendiente: desplegar y agregar `AUTOMATION_API_SECRET`, `AUTOMATION_OWNER_ID` y `AUTOMATION_INTAKE_AGENTS` en Vercel (§6), configurar ManyChat (§7) y el script de carga de contactos (§8).

## 1. Decisiones ya tomadas

1. **Solo viajan los leads de negocio.** ManyChat ya separa curiosos de negocio. Los curiosos se quedan en ManyChat: no ensucian el pipeline.
2. **Endpoint nuevo, no se toca `POST /api/automation/leads`.** Ese es de prospección en frío (pide nombre, ciudad y dedupea por teléfono, email, sitio o nombre+ciudad). Un lead de Instagram casi nunca trae esos datos.
3. **Los datos del flujo van en un JSON `intake`**, no en columnas. Si Agus cambia una pregunta del flujo no hace falta migrar.
4. **Upsert idempotente.** ManyChat puede llamar varias veces por el mismo lead (al responder, al calificar). Nunca duplica y **nunca baja de estado** a un lead que ya avanzó.
5. **Nada se envía a los leads desde el CRM.** El endpoint solo escribe filas, como el resto de `/api/automation/*`.
6. **Las migraciones las aplica Agus a mano** (`npm run db:push`), no Claude Code.

## 2. Contrato del endpoint

`POST /api/automation/leads/instagram`

Autenticación: igual que el resto, `Authorization: Bearer $AUTOMATION_API_SECRET`. El agente va en el header `X-Agent: manychat` (o en `agent`).

Body (esquema estricto con Zod, mismo estilo que `createLeadBodySchema`):

```json
{
  "manychat_id": "123456789",
  "ig_username": "estudio.demo",
  "name": "Sofía Pérez",
  "stage": "calificado",
  "rubro": "salud",
  "rubro_libre": null,
  "tarea": "consultas",
  "tarea_libre": null,
  "tamano": "2 a 10",
  "volumen": "10 a 30",
  "keyword": "MOTION",
  "pieza_origen": "DfC9JvfxG_Q",
  "utm": { "source": "instagram", "medium": "dm", "campaign": "motion", "content": "DfC9JvfxG_Q" }
}
```

- Obligatorios: `manychat_id` y `ig_username` (al menos uno; si falta el username se usa el nombre).
- `stage`: `respondio | calificado | tibio`.
- Todo lo demás es opcional, texto corto con límite de largo. ManyChat manda variables vacías como `""`: tratarlas como `null`.
- Respuestas: `201` creado, `200` actualizado (con `changed: [...]`), `400` body inválido, `401`, `403` agente no permitido.

### Mapeo de estado

| `stage` | Estado del lead |
|---|---|
| `respondio` | `RESPONDIO` |
| `tibio` | `RESPONDIO` (con `intake.stage = "tibio"`, es la señal para nutrir) |
| `calificado` | `CALIFICADO` |

Regla de no retroceso: si el lead ya está en un estado más avanzado (por ejemplo `REUNION_AGENDADA`), no se cambia el estado, pero igual se actualiza `intake` y se deja la actividad. Usar el orden de `lib/leads/status.ts`. Si el estado cambia, usar `applyLeadStatusChange` de `lib/leads/contact.ts` para que quede el `CAMBIO_ESTADO` en el historial. Ojo con el gate de reuniones: este endpoint nunca debe poner `REUNION_*`.

### Cómo encuentra al lead (en este orden)

1. `intake.manychat_id` igual (índice nuevo, ver migración).
2. `instagram_url` con el mismo @ normalizado (minúsculas, sin `@`, sin `?utm`). Esto cubre leads que ya existían por prospección en frío: no se duplica, se enriquece y se anota el toque de contenido.
3. `dedupe_key = "instagram:<ig_username>"` o, sin username, `"manychat:<manychat_id>"`. `leads` ya tiene `unique (owner_id, dedupe_key)`.

Si no lo encuentra, crea: `name` = nombre o `@username`, `instagram_url = https://instagram.com/<username>`, `lead_list_id = null`, `status` según el mapeo, `source` ver abajo.

Cada llamada deja una actividad `NOTA` con el agente, el stage y la pieza de origen (ej. `[manychat] calificado vía MOTION (pieza DfC9JvfxG_Q)`).

## 3. Migración

Archivo nuevo en `supabase/migrations/` con timestamp posterior a `20261030120000` (ej. `20261105120000_instagram_intake.sql`). Reglas de CLAUDE.md §4 vigentes: RLS ya está en `leads`, no se toca.

```sql
alter table public.leads
  add column if not exists acquisition_source text,      -- 'instagram_organico' | null (null = histórico)
  add column if not exists intake jsonb;                  -- datos del flujo de ManyChat

-- Para el upsert por ID de ManyChat
create index if not exists leads_intake_manychat_idx
  on public.leads (owner_id, (intake->>'manychat_id'))
  where intake ? 'manychat_id';

-- Para medir pieza → llamada
create index if not exists leads_intake_pieza_idx
  on public.leads (owner_id, (intake->>'pieza_origen'))
  where intake ? 'pieza_origen';
```

Después de aplicarla: `npm run db:types`. Hasta entonces, tipar localmente como hace `lib/weekly/db.ts` y no tocar `database.types.ts`.

## 4. Código

Seguir `lib/automation/create-lead.ts` y `app/api/automation/leads/route.ts` como modelo de estilo, comentarios en español.

- `lib/automation/instagram-intake.ts`: esquema Zod, normalización de @, búsqueda en los 3 pasos, upsert, mapeo de estado con regla de no retroceso. Recibe el cliente y `ownerId` explícitos y filtra por `owner_id` en **cada** query (service role, CLAUDE.md §4).
- `app/api/automation/leads/instagram/route.ts`: `authorizeAutomation`, valida el agente, llama al módulo, `revalidatePath` de `/leads`, `/leads/lista`, `/leads/seguimiento` y `/leads/[id]`.
- `lib/automation/agents.ts`: agregar `intakeAgentsFromEnv` con la variable nueva `AUTOMATION_INTAKE_AGENTS` (default `["manychat"]`). **No** sumar `manychat` a `AUTOMATION_WRITE_AGENTS` ni a la de admin: este agente solo puede usar este endpoint.
- `.env.example`: documentar `AUTOMATION_INTAKE_AGENTS`.
- UI mínima, solo lectura: en la ficha del lead (`app/(app)/leads/[id]/page.tsx`) un bloque "Instagram" con rubro, tarea, tamaño, volumen, keyword y pieza. En la lista de leads, un filtro "Origen: Instagram orgánico". No construir nada más en la UI en esta etapa.

## 5. Pruebas

Archivo `tests/automation-instagram-intake.test.mjs` en el estilo de `tests/automation-create-lead.test.mjs` (cliente falso, sin red). Sumarlo al script `test:automation` de `package.json`.

Casos mínimos:

- Esquema: rechaza campos desconocidos, body vacío, `stage` inválido; convierte `""` en `null`.
- Normaliza `@Estudio.Demo`, URLs con `?utm`, mayúsculas.
- Crea un lead nuevo con `acquisition_source = instagram_organico` y actividad `NOTA`.
- Segunda llamada con el mismo `manychat_id`: no duplica, devuelve `200`.
- Lead preexistente de prospección en frío con el mismo @: se enriquece, no se duplica.
- No retrocede: un lead en `REUNION_AGENDADA` que recibe `stage: respondio` conserva su estado y actualiza `intake`.
- Aislamiento: un lead de otro owner con el mismo @ nunca se toca.
- Agente no permitido → 403; sin Bearer → 401.

Verificación final obligatoria: `npm run typecheck`, `npm run lint`, `npm run test:automation`. El repo tiene un hook que bloquea `npm run build`: respetarlo.

## 6. Despliegue (Agus, a mano)

1. Revisar el diff y probar local contra una base de desarrollo (no la real).
2. Aplicar la migración (`npm run db:push`) y regenerar tipos.
3. En Vercel (proyecto de https://smokia-center.vercel.app/): confirmar `AUTOMATION_API_SECRET` (32+ caracteres) y `AUTOMATION_OWNER_ID`, y agregar `AUTOMATION_INTAKE_AGENTS=manychat` si se quiere explícito.
4. Deploy. Probar con `curl` y un lead de prueba:

```bash
curl -i -X POST https://smokia-center.vercel.app/api/automation/leads/instagram \
  -H "Authorization: Bearer $AUTOMATION_API_SECRET" \
  -H "X-Agent: manychat" -H "Content-Type: application/json" \
  -d '{"manychat_id":"test-1","ig_username":"prueba.smokia","stage":"respondio","pieza_origen":"TEST"}'
```

Repetir el mismo comando: debe devolver `200` y no crear otra fila. Borrar el lead de prueba desde la app.

## 7. ManyChat (se hace después de que el endpoint esté desplegado)

En el **borrador** del flujo "Embudo v1 - MOTION", agregar un paso **Realizar solicitud externa** (POST) en:

- el nodo que etiqueta CALIFICADO, con `stage = calificado`;
- los nodos que etiquetan TIBIO, con `stage = tibio`;
- opcional: justo después de responder el rubro, con `stage = respondio`, para no perder a quien abandona a mitad de camino.

Configuración del paso: URL del endpoint, headers `Authorization: Bearer <secreto>` y `X-Agent: manychat`, `Content-Type: application/json`, y el body de la sección 2 usando el selector de variables de ManyChat para `id`, `ig_username`, `first_name` y los campos de usuario (`rubro`, `rubro_libre`, `tarea`, `tarea_libre`, `tamano`, `volumen`, `keyword`, `pieza_origen`). **El secreto lo carga Agus directamente en ManyChat**; no se pega en chats ni en el repo. Usar "Probar solicitud" de ManyChat con un contacto de prueba antes de publicar. Publicar el flujo ("Actualizar") es decisión de Agus.

Si la llamada falla, ManyChat sigue con el flujo; no debe bloquear el DM al lead. Dejar el paso en un camino que no dependa de su respuesta.

## 8. Carga de contactos existentes (una sola vez)

1. En ManyChat: Contactos, filtrar por etiqueta (CALIFICADO, TIBIO, NEGOCIO), exportar CSV. Guardarlo **fuera** del repo.
2. Script `scripts/import-manychat-csv.mjs` que lee el CSV y llama al mismo endpoint (misma lógica de upsert, nada de SQL directo). Debe tener `--dry-run` como comportamiento por defecto y pedir `--apply` para escribir, informar creados / actualizados / saltados, y leer el secreto de una variable de entorno.
3. Correr primero en dry-run, revisar el resumen, recién después `--apply`.

## 9. Fuera de alcance (etapas siguientes)

- Webhook de Cal.com al agendar → `REUNION_AGENDADA`. Hoy el gate de reuniones exige un turno real en `appointments`, así que requiere diseño propio.
- Sincronizar de vuelta a ManyChat (por ejemplo marcar "contactado") con la API de ManyChat.
- KPI "pieza → llamada" en el panel de Operaciones, usando el índice de `pieza_origen`.

## 10. Criterio de cierre

- Un lead que responde el flujo aparece en `/leads` con origen Instagram orgánico y sus datos en la ficha.
- Repetir el flujo con la misma persona no duplica ni baja de estado.
- Un lead de prospección en frío que luego escribe por Instagram queda en una sola ficha.
- `typecheck`, `lint` y `test:automation` pasan.
