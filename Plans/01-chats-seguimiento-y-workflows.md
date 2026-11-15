# §1.26 — Chats para hacer seguimiento: fluidez, respuestas rápidas, etiquetas de Zernio y workflows TOFU/MOFU por pieza

> **Estado (2026-11-14):** sub-pasos 0 a 3 implementados. Migraciones `20261114120000`, `20261114130000` y `20261114140000` aplicadas el 2026-11-14, `db:types` regenerado. `build:verify`, lint y `npm run test:chats` (46 tests) en verde. Falta el sub-paso 4 (pantalla `/leads/chats/automatizaciones`, que espera los modelos TOFU/MOFU del dueño), el sub-paso 5 (cierre de documentación) y el checklist manual de cada sub-paso.

## Contexto

El inbox de Instagram (§1.25) ya funciona, pero cuesta usarlo para vender:
- **Se siente lento.** Cada clic en una conversación es una navegación completa al servidor (`?c=` en la URL). Eso vuelve a correr 6–8 consultas a Supabase, varias en cascada (cuentas → lista → nombres de leads → conversación → cuenta + mensajes → lead → directorio del equipo). Encima `loading.tsx` muestra el esqueleto entero en cada cambio. Al abrir un chat sin leer hay **tres refrescos completos seguidos**: `markConversationRead` con `revalidatePath`, después el evento de Realtime y después `router.refresh()`. Enviar un mensaje no muestra nada hasta que vuelve Zernio. Y la búsqueda necesita apretar Enter.
- **Cuesta leer en qué está cada persona.** No hay etiquetas, no se ve de un vistazo si le toca responder a uno o a la otra persona, ni cuánto le queda a la ventana de 24 h, y no existe el seguimiento.
- **No hay respuestas guardadas**, ni de texto ni de audio.
- **Las automatizaciones siguen en ManyChat.** El dueño quiere dos workflows de Zernio como modelo, uno **TOFU** y uno **MOFU**, y asignárselos a cada pieza nueva según su palabra clave y su tipo. Cada pieza manda su recurso por DM y **etiqueta al contacto en Zernio**. Esas etiquetas tienen que verse en SmokIA.

Decisiones del dueño (2026-11-14):
- §1.25 se da por **cerrado en OK** y se abre §1.26.
- Las etiquetas viven en **Zernio** (fuente de verdad) y se pueden editar desde SmokIA, que las escribe de vuelta en Zernio.
- **SmokIA crea el workflow en Zernio** para cada pieza, a partir del modelo TOFU o MOFU.
- Los audios se pueden **subir o grabar** en el navegador.

Lo que está confirmado en la API de Zernio:
- Los contactos tienen `tags` (`PATCH /v1/contacts/{id}`), y `GET /v1/inbox/conversations?tags=` filtra por etiqueta.
- Los workflows tienen nodos `add_tag` y `remove_tag`. Se crean con `POST /v1/workflows` en estado borrador y se prenden con `/activate`.
- El disparador `comment` lleva `keywords`, `matchType` y `platformPostId`, **uno por post**. Por eso cada pieza necesita su propio workflow.
- Hay webhooks `contact.tag_added`, `contact.tag_removed` y `workflow.run.started|completed|failed`. `message.sent` trae el `workflowId`.
- Instagram acepta audio por URL (`attachmentType: "audio"`).

Pendiente del dueño: mandar las definiciones de los workflows TOFU y MOFU. Hacen falta recién en el sub-paso 4; los sub-pasos 0 a 3 no dependen de eso.

---

## Sub-paso 0 — Cerrar §1.25 (sólo documentación)
- `Plans/01-inbox-omnicanal-zernio.md`: estado "cerrado 2026-11-14, checklist en OK por decisión del dueño". En `Plans/01-gestor-de-leads.md` (§1.25 y §1.26), reescribir §1.26 con este plan.
- `CLAUDE.md` §1 (tabla de módulos y párrafo de Leads) y la memoria `zernio-inbox-estado.md` actualizados.
- Copiar este plan a `Plans/01-chats-seguimiento-y-workflows.md` (CLAUDE.md §12).

## Sub-paso 1 — Fluidez de Chats (sin migración)
Cargar antes la skill `vercel:react-best-practices` y leer en `node_modules/next/dist/docs/` lo de `history.pushState` / `useOptimistic` de esta versión.

1. **La bandeja pasa a ser una isla de cliente.** El nuevo `components/leads/chats/inbox-client.tsx` recibe del Server Component la lista inicial y, si hay `?c=`, el detalle. Elegir un chat ya no navega: actualiza el estado y la URL con `window.history.pushState` (Next lo integra con el router), así que los enlaces y el refresh siguen funcionando.
2. **El hilo se carga con una Server Action, `loadConversation(id)`**, en `lib/chats/actions.ts`, que reusa `getConversationDetail`. En el cliente hay un caché en memoria por id: se muestra al instante lo que haya en caché y se revalida por detrás. Hay **prefetch** al pasar el mouse o hacer foco en una fila, y de las 3 primeras al cargar.
3. **Se envía de forma optimista** con `useOptimistic` en `message-composer.tsx`: la burbuja aparece en el momento con "Enviando…". Si falla, queda marcada con "No se pudo enviar · Reintentar", con el mismo `clientId`, así no se duplica.
4. **Marcar como leído también es optimista**: el contador pasa a 0 en el acto. Se saca `revalidatePath` de `markConversationRead` y de `setConversationArchived`, y se mantiene en lo que afecta a otras pantallas (lead y configuración).
5. **Realtime parcha el estado en vez de refrescar** (`realtime-refresh.tsx` pasa a ser `use-inbox-realtime.ts`). Un `INSERT` en `messages` del chat abierto se agrega al hilo. Un `UPDATE` o `INSERT` en `conversations` actualiza la fila y la sube arriba. El sondeo de seguridad de 45 s pide sólo la lista (`loadConversationList`), no la pantalla entera.
6. **La búsqueda es instantánea**: filtra en el cliente sobre lo que ya está cargado (con un debounce de 120 ms). Se consulta al servidor sólo si hay más de 150 conversaciones.
7. **Las lecturas del servidor van en paralelo.** `page.tsx` deja de esperar la lista antes del detalle. `getCurrentUser` y `getTeamDirectory` se envuelven con `cache()` de React para que no se repitan dentro del mismo request.
8. **Hilo liviano**: se dibujan los últimos 60 mensajes y hay un botón "Ver anteriores". Se usa `content-visibility: auto` en los bloques por día, y los avatares llevan `loading="lazy"` con tamaño fijo.
9. **Atajos de teclado**: `↑/↓` o `j/k` para moverse, `Enter` para abrir, `/` para buscar, `e` para archivar, `r` para enfocar la respuesta y `Esc` para volver (en mobile). Aparecen como ayuda discreta debajo del compositor.
10. **Movimiento según la marca** (CLAUDE.md §6): entre 120 y 200 ms `ease-out`, `.lm-rise` al entrar el hilo y respeto de `prefers-reduced-motion`. `loading.tsx` queda sólo para la primera carga.

Meta medible (con `performance.mark` en desarrollo): de clic a hilo visible en menos de 100 ms con caché y en menos de 400 ms en frío. Al enviar, la burbuja visible en menos de 50 ms.

## Sub-paso 2 — Respuestas rápidas de texto y audio
**Migración `<ts>_chat_quick_replies.sql`** (receta `agregar-tabla`):
- La tabla `chat_quick_replies` tiene `owner_id`, `kind` (`TEXTO` | `AUDIO`), `title`, `body`, `audio_path`, `audio_mime`, `audio_duration_ms`, `shortcut`, `sort_order`, `use_count` y timestamps. RLS con las cuatro políticas por `owner_id` e índice en `(owner_id, sort_order)`. Es de cada usuario: el socio tiene las suyas.
- Bucket privado de Storage `chat-audio`, con la ruta `<owner_id>/<uuid>.<ext>` y políticas de `storage.objects` que piden que la primera carpeta sea `(select auth.uid())::text`.

Comportamiento:
- **En el compositor**, escribir `/` o tocar el botón ⚡ abre el selector, que filtra mientras se escribe.
- **Texto**: se inserta en el campo con `{{nombre}}` ya reemplazado por el primer nombre de la persona, y se puede editar antes de enviar.
- **Audio**: se envía con **un toque**. Aparece un aviso de 4 s con "Deshacer" y recién después se manda de verdad. También se puede escuchar antes.
- **Envío de audio**: `sendChatMessage` acepta `quickReplyId`. El servidor firma una URL de Storage válida por 1 h y llama a `sendMessage` de `lib/chats/zernio.ts`, que se extiende con `attachmentUrl` y `attachmentType: "audio"`. Rigen la misma ventana de 24 h y el mismo `HUMAN_AGENT`: lo manda una persona con un toque, no una automatización. El mensaje se guarda con su adjunto, como cualquier otro saliente.
- **Grabar**: el componente nuevo `audio-recorder.tsx` graba en **WAV mono de 22 kHz** con `AudioWorklet` y un codificador PCM chico (`lib/chats/wav.ts`, testeable). WAV es un formato que Instagram acepta en todos los navegadores; webm y opus no siempre. Tope de 60 s y unos 2,6 MB. Subir un archivo acepta m4a, mp3, aac y wav, de hasta 8 MB.
- **Dónde se gestionan**: en una sección "Respuestas rápidas" de Configuración (crear, ordenar, renombrar y borrar) y con "Guardar como respuesta rápida" desde el compositor.

## Sub-paso 3 — Etiquetas de Zernio en SmokIA, y la bandeja que se lee de un vistazo
**Migración `<ts>_chat_tags.sql`**:
- `conversations` suma tres columnas: `zernio_contact_id text`, `tags text[] not null default '{}'` (con índice GIN) y `tags_synced_at`, más `follow_up_at timestamptz` y `follow_up_note text` (índice en `(owner_id, follow_up_at)`). Las políticas de equipo de §1.25 ya las cubren, así que no se abre nada nuevo.
- La tabla `chat_tag_labels` lleva `owner_id`, `tag` (el texto tal cual en Zernio), `label`, `stage` (`TOFU` | `MOFU` | `BOFU` | null), `description` y `sort_order`, con RLS por owner. Es el catálogo para mostrar nombres lindos y la etapa. Una etiqueta que no está en el catálogo se muestra cruda.

Ida y vuelta con Zernio (`lib/chats/zernio.ts` y el nuevo `lib/chats/tags.ts`):
- **Entra**: se suman `contact.tag_added`, `contact.tag_removed` y `workflow.run.*` a `WEBHOOK_EVENTS`. El webhook trata el evento como una **señal**, igual que con Apify: vuelve a pedir `GET /v1/contacts/{id}` con la key de la cuenta y **reemplaza el set completo** de `tags` de la conversación, lo que lo hace idempotente. Ubica la conversación por `zernio_contact_id`, o si no por el id del participante, y sólo dentro de `account.ownerId` (tercera excepción de CLAUDE.md §4; se revisa a mano). La ingesta guarda el `contactId` cuando Zernio lo manda. La sincronización manual y el cron refrescan las etiquetas de las conversaciones con actividad en los últimos 30 días.
- **Sale**: agregar o sacar una etiqueta desde SmokIA hace leer-modificar-escribir (`GET` y después `PATCH /v1/contacts/{id}` con el set completo) y actualiza la fila. La UI es optimista y revierte si falla.
- **Cuentas ya conectadas**: el botón "Actualizar webhook" en Configuración, o la re-registración automática al sincronizar, suma los eventos nuevos.

La bandeja que se lee de un vistazo:
- **Cada fila** muestra hasta 2 etiquetas más "+n", la etapa (TOFU/MOFU) y quién tiene que contestar ("Te toca responder" si el último mensaje es de la persona). También muestra lo que le queda a la ventana ("Quedan 3 h", en `danger` a menos de 2 h) y el estado del lead enlazado.
- **Filtros nuevos**: *Por responder*, *Ventana por cerrar*, *Seguimientos de hoy*, *Etiqueta…* y *Etapa…*, sumados a Todas, Sin leer y Archivadas.
- **Panel de contacto** a la derecha del hilo (plegable, siempre visible desde `xl`): datos del perfil, editor de etiquetas, lead enlazado (lo que hoy está en `conversation-actions.tsx`), "Llegó por" (la pieza y la palabra clave, desde el sub-paso 4) y **seguimiento**. El seguimiento lleva fecha rápida (mañana, en 3 días, en una semana) más una nota. Si hay lead enlazado, también escribe `next_action_at` con `updateLeadPlanning` (`lib/leads/contact.ts`).
- **Ficha del lead**: `lead-chat-card.tsx` muestra las etiquetas y la etapa.

## Sub-paso 4 — Modelos TOFU/MOFU y asignación a piezas

> **Estado (2026-11-14): sub-paso 4 implementado.** `lib/chats/automations.ts` (clonado puro, 7 tests), `lib/chats/automation-actions.ts`, la pantalla `/leads/chats/automatizaciones` (Modelos / Asignar / Piezas) y `getDefaultProfileId` en `lib/chats/zernio.ts`. Migración `20261114150000_content_automations_adjust.sql` aplicada y `db:types` regenerado. `build:verify`, lint (sin errores nuevos) y `npm run test:chats` (53 tests) en verde. Falta: usar la pantalla para elegir de verdad los moldes TOFU/MOFU ya creados en Zernio, asignar la primera pieza real, el checklist manual y el sub-paso 5 (cierre de documentación).
>
> **Workflows modelo creados en Zernio el 2026-11-14** (borrador, sin activar, cuenta `6af3924a1d6831ff796f71f1` / perfil `6af391748265ffc000eecd57`), a partir de los diagramas que mandó el dueño:
> - **TOFU** — `6af8dc04f5ecaa75415ad7dd` ("SmokIA · Modelo TOFU"): botones "Es para mí" / "Es para mi negocio"; "para vos" agradece y etiqueta `curioso`; "para mi negocio" etiqueta `negocio`, pregunta tareas/cuello de botella y, si responde, etiqueta `agenda` y ofrece la llamada.
> - **MOFU** — `6af8dc156e1263394b039c2e` ("SmokIA · Modelo MOFU"): avisa que ya manda el recurso, etiqueta `negocio` y hace 3 preguntas en cadena (de qué es el negocio, qué herramientas usa, si lo quiere aprender o llave en mano); si responde las 3, etiqueta `agenda` y ofrece la llamada.
> - Las dos usan el mismo criterio en cada `wait_for_reply`: si **no** responde (`timeout`), etiqueta `seguimiento` y termina ahí — así se decidió con el dueño (CLAUDE.md §13 no aplica acá, fue una decisión puntual, no un checklist).
> - Llevan el marcador `[[RECURSO]]` en el mensaje que entrega el recurso, listo para que la clonación por pieza lo reemplace por el link real. El disparador de los dos es una palabra interna oculta (`__smokia_tofu_model__` / `__smokia_mofu_model__`, `matchType: exact`) que nunca va a matchear sola: en producción se dispara por el postback de la automatización de comentario de cada pieza (patrón MANOS), que todavía no existe — la crea el sub-paso 4 al clonar.
> - Falta: la pantalla `/leads/chats/automatizaciones` que elige el reel y la palabra clave reales, clona el par automatización-de-comentario + workflow (reemplazando `[[RECURSO]]`/`[[PALABRA]]`/`[[TITULO]]`) y lo activa. También falta registrar estos dos ids en `chat_automation_templates` — esa tabla pide `zernio_comment_automation_id`, que recién existe cuando se clone el primer par, así que de momento sólo quedan documentados acá.

## Sub-paso 4 — Modelos TOFU/MOFU y asignación a piezas (necesita los modelos del dueño)

> **Ajuste del 2026-11-14, al implementar**, después de leer la cuenta real de Zernio. El embudo ya corre en Zernio como **automatizaciones de comentario** (APP, FABLE, MANOS), no como workflows con disparador `comment`. MANOS muestra el patrón completo:
> - La automatización de comentario lleva la palabra clave, el post, el "seguime primero", el DM y un botón *postback* `zernio:workflow:<id>`.
> - El workflow manda el recurso, hace el seguimiento y pone las etiquetas (`manos-respondio`, `lead-calificado` / `lead-no-calificado`).
>
> Las automatizaciones de comentario no pueden etiquetar; los workflows sí. Por eso **el modelo es el par** (automatización de comentario + workflow), y por cada pieza SmokIA clona los dos.

**Migración `<ts>_content_automations.sql`**:
- La tabla `chat_automation_templates` guarda `owner_id`, `channel_account_id`, `stage` (`TOFU` | `MOFU`), `zernio_comment_automation_id`, `zernio_workflow_id` (nullable, el que sale del postback), `name` y `tags` (los `add_tag` del workflow). Es única por `(owner_id, channel_account_id, stage)`.
- La tabla `content_automations` guarda `owner_id`, `channel_account_id`, `template_id`, `stage`, `platform_post_id`, `post_caption`, `permalink`, `keywords text[]`, `resource_url`, `resource_title`, `zernio_comment_automation_id`, `zernio_workflow_id`, `status` (`ACTIVA` | `PAUSADA` | `ERROR`), `error` y timestamps. Es única por `(owner_id, platform_post_id)`.
- La tabla `automation_runs` guarda `owner_id`, `automation_id`, `zernio_execution_id` (único), `conversation_id`, `status`, `started_at` y `finished_at`. La llenan los webhooks `workflow.run.*`.
- `conversations.source_automation_id` registra qué pieza trajo a cada persona.

Cómo funciona:
- **Modelos** (pantalla `/leads/chats/automatizaciones`, pestaña Modelos): de las automatizaciones de comentario de la cuenta, se elige cuál es el modelo TOFU y cuál el MOFU. Su workflow sale solo del postback. Los textos y los links llevan los marcadores `[[RECURSO]]` (el link), `[[TITULO]]` (el nombre del recurso) y `[[PALABRA]]`; se usan corchetes dobles porque Zernio vacía los `{{…}}` que no conoce. El modelo queda **pausado** en Zernio: es sólo un molde.
- **Asignar a una pieza**: se elige el post (de los recientes de la cuenta en Zernio, o se pega su id), el tipo (TOFU o MOFU), la palabra clave y el recurso (link y título). Hay vista previa del DM y el botón "Crear y activar". El servidor (`lib/chats/automations.ts` puro y testeado, más `lib/chats/automation-actions.ts`):
  1. Clona el workflow: reemplaza los marcadores en todos los textos, títulos y links, pone como disparador una palabra interna única (el postback no la necesita, porque saltea la condición), e inserta después del disparador `add_tag` con `tofu`/`mofu` y `kw-<palabra>`. Lo crea y lo activa.
  2. Clona la automatización de comentario: copia DM, botones (con el postback apuntando al workflow nuevo), "seguime primero", respuestas públicas, audiencia y reglas de repetición. Le pone el `platformPostId` y la palabra en tres variantes (tal cual, Capitalizada y MAYÚSCULA). La crea activa.
  3. Si algo falla, borra lo que alcanzó a crear y muestra el error en español.
- **Choque de palabras**: antes de crear, se listan las automatizaciones activas de la cuenta. Se bloquea si hay otra en el mismo post con la misma palabra, y se avisa si alguna sin post (que aplica a todos) usa la misma palabra. Sigue el aviso de ManyChat, por si quedó algún flujo viejo activo.
- **Lista de piezas automatizadas**: estado, palabra, recurso y métricas (disparos, DMs y clics de la automatización de comentario; ejecuciones y etiquetados del workflow), con pausar o reanudar (las dos piezas juntas) y borrar.
- El ingreso de leads por `POST /api/automation/leads/instagram` no cambia.

## Sub-paso 5 — Cierre
- `CLAUDE.md`: tabla de §1, §4 (eventos nuevos del webhook de Zernio, bucket `chat-audio`) y §11 (el webhook hay que re-registrarlo para los eventos nuevos, y los marcadores `[[…]]`).
- `npm run db:types` después de cada migración, y SETUP.md con el bucket.

---

## Archivos principales
- **Se tocan**: `app/(app)/leads/chats/page.tsx` y `loading.tsx`; `components/leads/chats/{chat-thread,conversation-list,message-composer,conversation-actions,thread-scroller,realtime-refresh,lead-chat-card}.tsx`; `lib/chats/{actions,queries,zernio,webhook,ingest,db}.ts`; `app/(app)/configuracion/page.tsx`; `components/shell/nav.ts`.
- **Nuevos**: `components/leads/chats/{inbox-client,contact-panel,quick-reply-picker,audio-recorder,tag-editor}.tsx`; `lib/chats/{tags,automations,automation-actions,wav,quick-replies}.ts`; `app/(app)/leads/chats/automatizaciones/page.tsx`; tres migraciones; `tests/chats-{tags,workflows,wav,quick-replies}.test.mjs`.
- **Se reusa**: `getConversationDetail`/`listConversations` (`lib/chats/queries.ts`); `replyWindow`/`canReply` (`lib/chats/window.ts`); `readAttachments` (`lib/chats/format.ts`); el cifrado de `channel_secrets` y `decrypt` (`lib/crypto.ts`); `updateLeadPlanning` (`lib/leads/contact.ts`); `Segmented`, `Button` y `EmptyState` de `components/leads/ui`; las clases `.lm-glass`/`.lm-rise` de `globals.css`.

## Verificación
- Por sub-paso: `npm run test:chats` (con los tests nuevos de clonado y marcadores, parseo de `contact.tag_*` y `workflow.run.*`, codificador WAV y reemplazo de `{{nombre}}`), lint y `npm run build:verify` (nunca `npm run build`).
- Fluidez: medir en el navegador del panel, con `next dev` y datos reales, los tiempos de clic a hilo y de envío a burbuja, antes y después.
- Checklist manual por sub-paso con la skill `checklist-manual` (CLAUDE.md §13), ítem por ítem:
  - abrir chats sin flash;
  - mensaje entrante sin refresh;
  - enviar texto y audio grabado y subido, y que **suene en Instagram**;
  - etiqueta puesta por un workflow que aparece sola;
  - etiqueta editada en SmokIA que aparece en Zernio;
  - pieza TOFU real: comentar la palabra → DM con el recurso → etiqueta → "Llegó por" correcto;
  - pausar o reanudar;
  - el socio ve las etiquetas de un chat compartido.
- Los webhooks de etiquetas y de ejecuciones necesitan la URL pública (Vercel): en local se prueba con "Sincronizar".
