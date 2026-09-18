# Awareness AI — Gestor de Marca Personal

## Context

El Gestor de Leads (Fase 1) todavía está en construcción y el de Facturación (Fase 2) no arrancó. Este plan se escribe igual, porque el diseño conviene pensarlo con tiempo y no con apuro — pero **no se escribe una línea de código de esta fase hasta que Leads esté desplegado y en uso diario real**, que es la regla de `CLAUDE.md` §2 y la que evita terminar con tres gestores a medio hacer.

Lo que se construye no es un tablero de métricas: eso ya lo da Instagram gratis. La diferencia está en que acá las métricas **se guardan día a día**, se cruzan entre sí y alimentan tres cosas que Instagram no hace — decir qué repetir y qué cortar, escribir el contenido siguiente, y publicarlo sin salir de la app.

El wireframe define la forma: la barra lateral de siempre, una fila de tabs por plataforma (`Instagram`, `YouTube`, y lo que venga después) y un área de contenido grande debajo. **Los tabs no se escriben a mano**: salen del registro de fuentes, igual que el formulario de `/leads/generar` se arma solo desde el `criteriaSchema` del proveedor elegido.

Instagram es la única plataforma real de esta fase. YouTube queda como tab visible y apagado.

### Decisiones ya tomadas

| Decisión | Elección |
|---|---|
| Fuente de métricas | **Windsor.ai** — la cuenta `agustinpaulise_` ya está conectada, con lectura y escritura |
| Publicación | **Desde la app, con un clic.** Sin programación automática |
| Competencia | **Sólo contenido orgánico**, vía Apify. Los ads quedan afuera (ver §3.8) |
| YouTube | **Diferido.** Tab visible pero apagado, como los módulos del sidebar |
| Motor de IA | **Claude Opus 5** (`claude-opus-5`) vía `@anthropic-ai/sdk` |
| Historial de métricas | **Snapshot diario propio.** Instagram no devuelve historial (ver §3.2) |
| Archivos de video | **Supabase Storage**, bucket público — Meta exige una URL que pueda buscar (ver §3.7) |

### Costos y límites

Tres servicios pagos entran en esta fase. Conviene tenerlos a la vista desde el principio, porque dos cobran por uso y uno se vuelve limitante al sumar la segunda plataforma.

| Servicio | Qué cuesta | Límite a tener presente |
|---|---|---|
| **Windsor.ai** | Trial 30 días; después Forever Free (1 fuente, 1 cuenta) o Basic US$23/mes | El trial trae **sólo 30 días de historial**. Forever Free alcanza para Instagram solo; YouTube obliga a pagar |
| **Claude Opus 5** | US$5 por millón de tokens de entrada, US$25 de salida | El prefijo del system prompt se cachea, así que el costo real por mensaje es una fracción de eso |
| **Apify** | Por resultado, igual que en Leads | Sólo lo usa §3.8. Al probar, `maxResults` chico |

---

## Stack agregado

Sobre las fundaciones de la Fase 0 no se cambia nada. Se suma:

- **Windsor.ai Connectors API** — REST plano, sin SDK, igual que Apify
- **`@anthropic-ai/sdk`** — la única dependencia nueva de `package.json`
- **Supabase Storage** — un bucket para los archivos que se publican

Y se reusa, sin reescribir: `lib/crypto.ts` y la tabla `settings` para las dos API keys nuevas, `lib/apify/client.ts` entero para la competencia, `components/leads/agenda/calendar-grid.tsx` para el planificador, y el patrón de `components/leads/job-status-panel.tsx` para el progreso en vivo.

---

## Fase 3 — Gestor de Marca Personal

### 3.1 Conexión de cuentas — capa de fuentes

Con dos plataformas a la vista y más después, la integración no puede ser código de Instagram con `if`s: es un registro de fuentes, igual que el de proveedores de leads.

`lib/brand/sources/types.ts`:

```ts
export interface BrandSourceProvider {
  id: BrandPlatform             // INSTAGRAM | YOUTUBE
  label: string                 // el texto del tab
  connector: string             // slug de Windsor: "instagram"
  accountFields: string[]       // field ids de Windsor para el snapshot de cuenta
  mediaFields: string[]         // field ids para cada pieza de contenido
  mapAccount(row: unknown): NormalizedAccountSnapshot | null
  mapMedia(row: unknown): NormalizedPost | null   // null descarta la fila
  capabilities: {
    audience: boolean           // demografía de seguidores
    stories: boolean            // contenido efímero
    publish: BrandPostKind[]    // qué formatos se pueden publicar
  }
  publish?(params: PublishParams): Promise<{ externalId: string }>
}
```

`lib/brand/sources/registry.ts` los indexa. **Los tabs del wireframe se renderizan desde ese array**, así que sumar una plataforma es un archivo nuevo y una línea en el registro — nunca una pantalla editada.

`lib/windsor/client.ts` es el espejo de `lib/apify/client.ts`: `fetch` crudo, sin SDK, contra `https://connectors.windsor.ai/{connector}`. Dos funciones — una para leer (`fields`, `date_from`/`date_to`, `select_accounts`) y otra para ejecutar acciones de escritura contra `…/{connector}/actions`.

**La API key se carga en `/configuracion`**, en una card calcada de la de Apify: se cifra con `encrypt()` de `lib/crypto.ts`, se guarda en `settings` bajo la clave `windsor_api_key`, y al cliente sólo vuelve el valor enmascarado. Botón **"Probar conexión"** que pide un campo trivial del conector y confirma que la key sirve. Al lado, la misma card para `anthropic_api_key`, que usan §3.5 y §3.6.

La tabla `brand_accounts` guarda las cuentas detectadas — plataforma, id externo, usuario, nombre visible y última sincronización. El id externo importa: es lo que se manda en `select_accounts` cuando haya más de una cuenta en la misma plataforma.

> **La key viaja en el query string.** Windsor no soporta autenticación por header, así que la key va en la URL. Eso obliga a una regla que en Apify no hacía falta: **nunca loguear la URL armada**, ni en un `console.log` de desarrollo ni en un mensaje de error. El error se reporta con el status y el conector, jamás con la URL completa.

### 3.2 Esquema de datos y sincronización

**La decisión central de la fase está acá, y es menos obvia de lo que parece:** la API de Instagram no devuelve historial. `followers_count` está documentado como *"the count for today"*, y los insights por día sólo cubren los últimos 30. Si las métricas se leen a demanda y no se guardan, la app nunca va a poder mostrar una curva de crecimiento ni responder "¿este reel siguió sumando views después de la primera semana?".

Por eso las métricas se guardan como **snapshot diario**: cada sincronización escribe una fila por día, y el día es parte de la clave única. Un `upsert` sobre esa clave hace que sincronizar dos veces el mismo día pise el número viejo con el más fresco en vez de duplicarlo.

**Tablas** (todas con `owner_id` e índice, como manda `CLAUDE.md` §4):

- **`brand_accounts`** — las cuentas conectadas, una fila por cuenta y plataforma
- **`brand_posts`** — el catálogo de contenido: tipo, caption, permalink, thumbnail, fecha de publicación y el payload original en `raw`. Único por `(owner_id, account_id, external_id)`
- **`brand_post_metrics`** — el snapshot por pieza y por día: views, alcance, likes, comentarios, guardados, compartidos, seguidores ganados, y para reels el watch time total, el promedio y el **skip rate**. Único por `(post_id, captured_on)`
- **`brand_account_metrics`** — el snapshot de la cuenta por día: seguidores, seguidos, cantidad de publicaciones, alcance, views, interacciones y toques al link del perfil. Único por `(account_id, captured_on)`
- **`brand_audience`** — la demografía, en formato largo: dimensión (edad, género, ciudad, país), valor y tamaño. Guardarla larga en vez de una columna por tramo evita migrar la tabla cada vez que Instagram cambia los cortes
- **`brand_sync_jobs`** — el equivalente de `scrape_jobs`: estado, rango de fechas, filas importadas, error y tiempos

**Enums nuevos:** `brand_platform`, `brand_post_kind` (`REEL`, `POST`, `CARRUSEL`, `HISTORIA`, `VIDEO`, `SHORT`) y `brand_audience_dimension`. El estado del job reusa `job_status`, que ya existe.

**Flujo de una sincronización:**

1. Se dispara desde uno de tres lados — el botón "Sincronizar ahora", un chequeo al abrir `/marca` si la última sincronización quedó vieja, o `GET /api/jobs/sync-marca` protegido por `CRON_SECRET`, agregado a `vercel.json` a otra hora que el reconcile de Leads
2. Se crea la fila en `brand_sync_jobs`, se descifra la key y se consulta Windsor por cada tabla que el proveedor declara en `accountFields` y `mediaFields`
3. La UI se suscribe por **Realtime** a esa fila y el progreso aparece solo, sin polling — mismo patrón que la pantalla de generación de leads
4. Cada fila se valida con Zod y se mapea con `provider.mapMedia` / `provider.mapAccount`. Un scraper o una API de terceros devuelven lo que quieren y cambian sin avisar, así que la validación va en el borde
5. Upsert sobre las claves únicas de arriba. **Es idempotente**: las tres rutas pueden pisarse sin duplicar nada

> **Windsor es pull, no push.** A diferencia de Apify no hay webhook, así que no hace falta secreto en la URL ni service role: la sincronización corre dentro de una sesión de usuario y respeta RLS como cualquier otra consulta. El cron es la única excepción, y usa el mismo esquema de `CRON_SECRET` que ya existe. **La service role no entra en esta fase.**

> **El trial recorta el historial a 30 días.** La primera sincronización, entonces, sólo puede traer un mes hacia atrás — no hay forma de recuperar lo anterior. De ahí en adelante el historial es propio y ya no depende del plan contratado, que es exactamente el motivo por el que conviene encender la sincronización temprano aunque el resto del gestor no esté listo.

Se cierra con la receta de `CLAUDE.md` §10: migración con las tablas, RLS activo, las cuatro políticas en el loop, índice sobre `owner_id` y sobre `captured_on`, alta de `brand_sync_jobs` en la publicación de Realtime, y `npm run db:types`.

### 3.3 Estado actual — el dashboard

`/marca` — es el área grande del wireframe y la home del gestor. Zero-state primero, como toda pantalla del repo: sin cuenta conectada, un `EmptyState` que lleva a `/configuracion`.

- **Franja de KPIs** con `StatTile`: seguidores y su variación a 30 días, alcance, views, interacciones totales y seguidores nuevos. Cyan para los resultados, violeta para el proceso — la convención sale de las variantes del componente, no se decide acá
- **Curva de seguidores** — SVG a mano siguiendo `components/leads/dashboard/activity-timeline-chart.tsx`, que ya resuelve ejes, gridlines, crosshair y tooltip
- **Views y alcance por día**, en la misma grilla
- **Audiencia** — edad, género y top de ciudades, con el patrón de barras CSS de `industry-distribution.tsx`. Siempre con el número al lado de la barra: el color nunca es la única codificación
- **Últimos reels**, en grilla visual con thumbnails, views y watch time. Es lo primero que se mira al abrir la app, así que va arriba del fold aunque sea el bloque más pesado

> Antes de escribir el primer gráfico, cargar la skill `dataviz` (`CLAUDE.md` §12). La paleta de series sale de los tokens de marca, no de los defaults de la librería — y acá hay más series simultáneas que en el dashboard de Leads, así que la regla pesa más.

### 3.4 Biblioteca de contenido

`/marca/contenido` — todo el contenido publicado con sus métricas, que es la pata de "trackear todo".

- Grilla de thumbnails ordenable por views, watch time, **skip rate**, guardados, compartidos y seguidores ganados. Ordenar por skip rate ascendente es la consulta más útil de la pantalla: muestra qué hooks retuvieron
- Filtros por tipo (reel, post, carrusel, historia) y por rango de fechas
- Ficha de cada pieza con la **evolución de sus métricas desde que se publicó** — para eso sirven los snapshots diarios de §3.2, y es lo único que la app puede mostrar y la app de Instagram no
- Caption, hashtags y comentarios de la pieza

> **Las historias duran 24 horas.** La API las expone sólo mientras están vivas, así que una historia queda registrada únicamente si una sincronización cae dentro de esa ventana. Con el cron diario entran casi todas, pero no está garantizado, y conviene que la pantalla lo diga en vez de fingir que el historial de historias está completo.

### 3.5 Análisis y recomendaciones

`/marca/analisis`. El paso tiene una opinión fuerte y conviene dejarla escrita: **los números se calculan en SQL y TypeScript, no se le piden al modelo.**

`lib/brand/insights/` computa los patrones de forma determinística — mejor hora y mejor día para publicar, duración vs. retención, hook vs. skip rate, formato vs. guardados, largo del caption, hashtags que aparecen en lo que funcionó. Recién con esos agregados calculados entra Claude: lee la tabla resumida más el mejor y el peor contenido del período, y escribe qué repetir, qué cortar y qué probar.

Mandarle el dump crudo al modelo y pedirle que saque promedios sale más caro, da resultados peores y no es reproducible dos veces seguidas. El modelo aporta la lectura, no la aritmética.

La tabla **`brand_recommendations`** guarda cada recomendación con su `evidence` en `jsonb` — las piezas y los números que la sostienen, para que se pueda auditar de dónde salió — y un estado `NUEVA`, `APLICADA` o `DESCARTADA`. Una recomendación sin evidencia trazable es una opinión, y de esas ya hay suficientes en Instagram.

Configuración del modelo: `claude-opus-5` con `thinking: { type: "adaptive" }` y `output_config: { effort: "high" }`, y salida estructurada para que la lista de recomendaciones entre tipada a la base sin parseo frágil.

### 3.6 Generación de contenido — el chat

`/marca/generar` — el chatbot que escribe el contenido siguiente.

- **Respuesta en streaming**, porque una idea larga con `effort: "high"` tarda y una pantalla quieta parece colgada
- **El system prompt lleva dos cosas fijas**: la voz del manual de marca y el propio contenido que mejor funcionó. Van en un prefijo con `cache_control`, así que se cachean entre mensajes y la pregunta variable queda después del último breakpoint — es lo que hace que el costo por mensaje sea una fracción del precio de lista
- **Tools**: `buscar_mis_posts` y `metricas_de_post` contra la base propia, más el server tool de búsqueda web para las tendencias actuales del nicho. Con las dos primeras, el modelo puede fundamentar una idea en un reel concreto en vez de inventar
- **Produce** ideas, guiones con hook / desarrollo / CTA, captions y hashtags
- **"Guardar como idea"** escribe un `brand_content_items` y la idea aparece en el planificador. Sin ese botón el chat es una conversación que se pierde; con él es la entrada del pipeline

Las tablas `brand_chat_threads` y `brand_chat_messages` guardan la conversación, porque el hilo anterior es contexto útil y porque perder un guion bueno por recargar la pestaña sería el peor bug de la fase.

### 3.7 Planificador y publicación

`/marca/planificador` — **reusando `components/leads/agenda/calendar-grid.tsx`**, que ya resuelve la grilla de mes y semana con drag & drop nativo. Mover una pieza de día es arrastrarla, y eso ya está escrito.

`brand_content_items` es la tabla del pipeline: plataforma, tipo, título, idea, guion, caption, hashtags, estado (`IDEA` → `GUION` → `GRABADO` → `EDITADO` → `LISTO` → `PUBLICADO`), fecha planificada, ruta del archivo y, una vez publicado, el id de la pieza en `brand_posts`.

El archivo se sube a Supabase Storage, al bucket `brand-media`. **Las restricciones son de Instagram y hay que validarlas antes de subir**, no después — fallar una publicación con 200 MB ya subidos es la peor forma de descubrir que el video duraba 16 minutos:

| Formato | Restricción |
|---|---|
| **Reel / video** | MP4 o MOV, hasta 1 GB, entre 3 segundos y 15 minutos. 9:16 recomendado. Instagram publica todo video simple como Reel |
| **Imagen** | JPEG, hasta 8 MB, relación entre 4:5 y 1.91:1 |
| **Historia** | Imagen o video, video hasta 100 MB y entre 3 y 60 segundos. Sin caption |
| **Carrusel** | Entre 2 y 10 imágenes JPEG. **No admite video** |

**"Publicar ahora"** llama a `provider.publish()`, que ejecuta la acción de Windsor correspondiente al tipo, guarda el id devuelto en la fila, y deja que la siguiente sincronización empalme esa pieza con su `brand_posts` y sus métricas. El círculo se cierra ahí: lo que se planificó en la app vuelve a la app medido.

> **El bucket tiene que ser público.** Instagram no recibe el archivo: recibe una URL y la busca desde sus propios servidores, así que una URL firmada de corta vida no sirve. La escritura se restringe por política con el `owner_id` como primer segmento de la ruta, pero la lectura queda abierta — cualquiera con el link exacto ve el archivo. Es contenido que está por publicarse igualmente, así que el riesgo es bajo, pero es una excepción al aislamiento por usuario y por eso se escribe acá en vez de descubrirse leyendo la configuración del bucket.

**No hay publicación automática.** `scheduled_for` es el plan — ordena el calendario y alimenta el "qué toca hoy" — pero el botón lo aprieta una persona. La razón es concreta: el cron de Vercel en plan Hobby corre una vez por día, así que "publicar a las 19:30" no se puede cumplir sin `pg_cron` de Supabase o un plan pago. Antes de sumar esa pieza conviene ver si la fricción del botón molesta de verdad.

### 3.8 Competencia

`/marca/competencia` — las cuentas que se eligen seguir, con `brand_competitors` y `brand_competitor_posts`.

Reusa `lib/apify/client.ts` entero y el actor `apify/instagram-scraper` que ya usa `lib/providers/instagram.ts`, con el mismo esqueleto: job, corrida, paginado del dataset y reconciliación idempotente. No hay integración nueva que construir, sólo un mapeo distinto.

Lo que muestra: cadencia de publicación, mezcla de formatos, y **qué contenido de ellos explotó relativo a su propio promedio** — que es la única comparación que significa algo entre cuentas de tamaños distintos.

> **Sólo se ve lo público.** Likes, comentarios, views y caption sí; alcance, guardados, watch time y skip rate **no** — esas son privadas del dueño de la cuenta y ninguna herramienta las tiene. Confundir las dos listas hace que las comparaciones mientan, así que la pantalla muestra métricas propias y ajenas en bloques separados, nunca en la misma tabla.

> **Los ads quedan afuera, y no por falta de ganas.** La Ad Library API oficial de Meta se limitó a avisos políticos y de temas sociales de la Unión Europea, y está explícitamente documentada como no destinada a inteligencia competitiva. La alternativa sería scrapear la Ad Library con un actor de terceros: sería lo más frágil de todo el plan, sobre una página que Meta cambia seguido, y rompería sin aviso. Si más adelante aparece una fuente estable, entra como un paso nuevo detrás de la misma abstracción.

Cobra por resultado, igual que en Leads: al probar, `maxResults` chico.

### 3.9 YouTube — diferido

No se construye ahora. El tab se ve desde el primer día pero apagado, con el mismo criterio que los módulos del sidebar — la estructura se lee completa aunque no esté todo hecho (`CLAUDE.md` §2).

Para encenderlo hacen falta tres cosas, en orden: conectar YouTube en Windsor (pasa a ser la segunda fuente, así que obliga a un plan pago), escribir `lib/brand/sources/youtube.ts` implementando `BrandSourceProvider`, y agregarlo al registro.

**No hace falta tocar la UI.** Si al sumar YouTube se está editando una pantalla, la abstracción de §3.1 se rompió — mismo criterio que la receta de fuentes de leads en `CLAUDE.md` §9.

---

## Fases siguientes (fuera de alcance ahora)

- **Fase 4 — Panel principal.** Recién con los tres gestores vivos: agrega las métricas de las tres patas del negocio
- **YouTube** (§3.9) y **ads de la competencia** (§3.8), cada uno cuando exista la condición que hoy los bloquea

---

## Archivos principales

```
supabase/migrations/*.sql                    ← tablas de marca + RLS + Realtime
app/(app)/marca/page.tsx                     ← dashboard, tabs por plataforma
app/(app)/marca/contenido/page.tsx
app/(app)/marca/analisis/page.tsx
app/(app)/marca/generar/page.tsx             ← el chat
app/(app)/marca/planificador/page.tsx
app/(app)/marca/competencia/page.tsx
app/(app)/configuracion/page.tsx             ← + keys de Windsor y Anthropic
app/api/jobs/sync-marca/route.ts             ← cron, protegido por CRON_SECRET
components/shell/nav.ts                      ← available: true + children
components/brand/*                           ← tabs, grilla de contenido, chat
lib/windsor/client.ts                        ← REST, la key va en query string
lib/brand/sources/{types,registry,instagram}.ts
lib/brand/{actions,queries,sync}.ts
lib/brand/insights/*                          ← patrones, calculados sin modelo
lib/brand/ai/{client,prompts,tools}.ts       ← claude-opus-5
lib/settings/constants.ts                    ← windsor_api_key, anthropic_api_key
```

---

## Verificación

**Local**

1. Cargar la key de Windsor en `/configuracion` → "Probar conexión" en verde. Verificar en la base que el valor está cifrado, no en texto plano
2. **Probar RLS de verdad:** con el segundo usuario del panel de Supabase, insertar una cuenta de marca a su nombre y confirmar desde la sesión propia que no aparece ni en la UI ni consultando la tabla directo con la anon key
3. Primera sincronización: confirmar que aparecen los reels con thumbnails y que el job pasó por `EN_CURSO` hasta `COMPLETADO` con el progreso moviéndose solo
4. **Contrastar contra la app de Instagram el mismo día** — seguidores, views y likes de los últimos tres reels tienen que coincidir. Si no coinciden, el mapeo está mal y todo lo que viene arriba también
5. Sincronizar **dos veces el mismo día**: la cantidad de filas de métricas no debe cambiar — valida el upsert sobre `(post_id, captured_on)`
6. Esperar al día siguiente y sincronizar: ahora sí tiene que haber una fila nueva por pieza, y la ficha de un reel tiene que mostrar dos puntos en la evolución
7. Ordenar la biblioteca por skip rate ascendente y cruzar el primer resultado contra el dato que muestra Instagram para ese reel
8. Generar recomendaciones y verificar que cada una trae su `evidence` y que los números de la evidencia se pueden reproducir con una consulta SQL directa
9. Abrir el chat, pedir una idea, guardarla, y confirmar que aparece en el planificador en estado `IDEA`
10. Subir un video que viole una restricción a propósito (17 minutos, o un carrusel con un video adentro): tiene que rebotar **antes** de subir el archivo, con el motivo concreto
11. Agregar un competidor con `maxResults` chico y confirmar que las métricas propias y las ajenas se muestran en bloques separados
12. Revisar en celular: el dashboard, la grilla de contenido y el planificador tienen que ser usables en pantalla chica

**Producción**

13. Desplegar con las variables cargadas y el cron de `sync-marca` agendado a otra hora que el de reconcile
14. Confirmar que el cron corrió solo al día siguiente y dejó el snapshot, sin abrir la app
15. **Publicar un reel de prueba** desde el planificador — corto y sin importancia. Verificar que aparece en Instagram, que el estado pasó a `PUBLICADO`, y que la sincronización siguiente lo empalma con sus métricas
16. Confirmar que la URL de Windsor con la key no aparece en ningún log de Vercel, ni en un error ni en un aviso
17. Confirmar que `SUPABASE_SERVICE_ROLE_KEY` no aparece en ningún bundle del cliente (`grep` sobre `.next/static`)

Cada `§3.x` se cierra con su propio checklist manual confirmado ítem por ítem en la app corriendo, antes de arrancar el siguiente — es la regla de `CLAUDE.md` §13 y acá pesa especialmente, porque una métrica mal mapeada no rompe el build: simplemente miente.

**Criterio de cierre de la Fase 3:** planificar un reel en la app, publicarlo desde la app, y una semana después entender en la app por qué funcionó o por qué no — sin abrir Instagram Insights en ningún momento del recorrido.
