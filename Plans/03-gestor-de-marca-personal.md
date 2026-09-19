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
| Criterio editorial del agente | **[Sistema Operativo de Contenido](../Awareness_AI_Sistema_de_Contenido.md)** — el prompt canónico de la marca personal (ver §3.10) |

### El Sistema Operativo de Contenido — cambio del 2026-09-18

El plan original trataba a la IA como un redactor: §3.5 le pedía leer patrones y §3.6 le pedía escribir guiones. Eso resultó ser la mitad del trabajo, y la mitad menos valiosa — escribir un guion es lo que cualquier modelo hace gratis.

Lo que la app puede hacer y el chat suelto no es **operar un ciclo**: investigar el mercado, formular una hipótesis, publicar, medir contra el rendimiento propio, aprender del resultado y explotar lo que funcionó. `Awareness_AI_Sistema_de_Contenido.md` es ese criterio escrito completo — norte de la marca, audiencia, filtro editorial, prioridad de evidencia, clasificación de resultados y las colecciones de memoria que el sistema debe mantener.

El documento no se adapta ni se resume: **es el system prompt, literal**. Pero tres de sus reglas piden cosas que el gestor todavía no tiene, y de ahí salen los tres pasos nuevos:

| Regla del SOC | Qué exige | Paso |
|---|---|---|
| §16, §17, §18 — comparar contra el baseline propio | Una mediana móvil y una clasificación por objetivo, no "muchas views" | **§3.11** |
| §26 — base de conocimiento persistente | Nueve colecciones que sobreviven a la conversación | **§3.12** |
| §12, §13, §14, §19 — cada pieza es una hipótesis; un ganador se convierte en cluster | Campos de hipótesis y de linaje en el pipeline | **§3.7**, ampliado |

El orden es §3.10 → §3.11 → §3.12, y recién después §3.7. El prompt va primero porque el propio SOC §26 está escrito para degradar bien (*"si el entorno permite memoria…"*): el agente mejora el mismo día en que se carga, y después se le va dando la infraestructura que le falta.

> **Este documento es sobre la marca personal de Agus, no sobre la agencia.** `Awareness_AI_Manual_de_Marca.md` es identidad visual — el `buildBrandVoicePrompt()` que hay hoy en `lib/brand/ai/prompts.ts` improvisa una voz a partir de un manual de colores y tipografías, y su propio comentario lo admite. Esa función se borra en §3.10. Son dos marcas distintas con dos documentos distintos.

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
- **`@anthropic-ai/sdk`** — el SDK del modelo
- **`react-markdown`** y **`remark-gfm`** — las respuestas del chat vienen en markdown (encabezados, listas, tablas) y se renderizan en vez de mostrarse crudas. Sumadas en la verificación de §3.6; no renderizan HTML crudo y sanean las URLs
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
- **Badge de clasificación en cada pieza** — ganador de alcance, de autoridad, neutro o experimento fallido, contra el baseline de la cuenta. Sale de §3.11, y es lo que convierte la grilla de "qué publiqué" en "qué funcionó". El badge nunca es la única codificación: al lado va el múltiplo (`2,3× la mediana`)
- Ficha de cada pieza con la **evolución de sus métricas desde que se publicó** — para eso sirven los snapshots diarios de §3.2, y es lo único que la app puede mostrar y la app de Instagram no
- Caption, hashtags y comentarios de la pieza

> **Las historias duran 24 horas.** La API las expone sólo mientras están vivas, así que una historia queda registrada únicamente si una sincronización cae dentro de esa ventana. Con el cron diario entran casi todas, pero no está garantizado, y conviene que la pantalla lo diga en vez de fingir que el historial de historias está completo.

### 3.5 Análisis y recomendaciones

`/marca/analisis`. El paso tiene una opinión fuerte y conviene dejarla escrita: **los números se calculan en SQL y TypeScript, no se le piden al modelo.**

`lib/brand/insights/` computa los patrones de forma determinística — mejor hora y mejor día para publicar, duración vs. retención, hook vs. skip rate, formato vs. guardados, largo del caption, hashtags que aparecen en lo que funcionó. Recién con esos agregados calculados entra Claude: lee la tabla resumida más el mejor y el peor contenido del período, y escribe qué repetir, qué cortar y qué probar.

Mandarle el dump crudo al modelo y pedirle que saque promedios sale más caro, da resultados peores y no es reproducible dos veces seguidas. El modelo aporta la lectura, no la aritmética.

La tabla **`brand_recommendations`** guarda cada recomendación con su `evidence` en `jsonb` — las piezas y los números que la sostienen, para que se pueda auditar de dónde salió — y un estado `NUEVA`, `APLICADA` o `DESCARTADA`. Una recomendación sin evidencia trazable es una opinión, y de esas ya hay suficientes en Instagram.

Configuración del modelo: `claude-opus-5` con `thinking: { type: "adaptive" }` y `output_config: { effort: "high" }`, y salida estructurada para que la lista de recomendaciones entre tipada a la base sin parseo frágil.

**Ampliación del SOC (§3.10).** El prompt de este paso pasa a ser el mismo documento canónico, y eso cambia tres cosas concretas:

- **La respuesta tiene la forma del SOC §29**: qué sabemos (respaldado por datos), qué sospechamos (hipótesis razonable), qué no sabemos todavía (variables sin muestra), qué duplicaría, qué reduciría, qué testearía ahora. Las tres últimas ya son las tres categorías que la tabla guarda — `REPETIR`, `CORTAR`, `PROBAR` —, así que el esquema de salida no cambia; lo que cambia es que las dos primeras dejan de mezclarse con ellas
- **`brand_recommendations` suma `objective`** (`ALCANCE` | `AUTORIDAD` | `CONVERSION`): el SOC §16 es explícito en que no se optimiza todo para lo mismo, y una recomendación que no dice para qué objetivo sirve no se puede evaluar después
- **Un `REPETIR` sobre un ganador no puede ser "hacé más de esto".** El SOC §13 y §14 piden un cluster: mismo tema y formato, hook / ángulo / ejemplo distintos primero, y recién después transferir el mecanismo a otro problema. La recomendación tiene que traer las variaciones concretas, y de ahí salen las piezas que §3.7 planifica

### 3.6 Generación de contenido — el chat

`/marca/generar` — el chatbot que escribe el contenido siguiente.

- **Respuesta en streaming**, porque una idea larga con `effort: "high"` tarda y una pantalla quieta parece colgada
- **El system prompt es el SOC completo**, en un prefijo con `cache_control` — el armado exacto y su costo están en §3.10. Lo que era "la voz del manual de marca más el contenido que mejor funcionó" pasa a ser el criterio editorial entero, y el estado variable (baseline, ganadores vigentes, experimentos abiertos) viaja aparte para no romper el caché
- **Tools**: `buscar_mis_posts` y `metricas_de_post` contra la base propia, `buscar_conocimiento` / `guardar_conocimiento` contra la memoria de §3.12, y el server tool de búsqueda web para las tendencias del nicho. Con las primeras, el modelo funda una idea en un reel concreto en vez de inventar; con las de conocimiento, se acuerda de lo que concluyó el mes pasado
- **Produce** ideas, guiones con hook / desarrollo / CTA, captions y hashtags — con la estructura del SOC §27 cuando le piden ideas: idea, origen del patrón, hipótesis que se testea y métrica que va a decidir si funcionó
- **"Guardar como idea"** escribe un `brand_content_items` y la idea aparece en el planificador. Sin ese botón el chat es una conversación que se pierde; con él es la entrada del pipeline. **Guarda también la hipótesis y el objetivo** (§3.7): una pieza sin hipótesis no se puede evaluar después, y evaluar después es el punto entero del sistema

> **El SOC §24 le pide criticar, no acompañar.** Si la idea que trae el usuario es débil, el agente tiene que decir qué falla y dónde se perdería la atención, en vez de mejorarla calladamente. Es un cambio de tono que se nota en la primera conversación y conviene esperarlo: el chat no siempre va a devolver un guion.

Las tablas `brand_chat_threads` y `brand_chat_messages` guardan la conversación, porque el hilo anterior es contexto útil y porque perder un guion bueno por recargar la pestaña sería el peor bug de la fase.

**Lo guardado tiene que poder verse.** Se descubrió al verificar el paso: apretar "Nueva conversación" dejaba la anterior inalcanzable, y una idea guardada no aparecía en ningún lado porque el planificador es un paso posterior. Por eso la pantalla lista las conversaciones anteriores a la izquierda y deja volver a cualquiera (`?hilo=<id>` en la URL, así F5 no cambia de hilo), y las ideas guardadas se ven en `/marca/ideas` — una lista de sólo lectura sobre `brand_content_items` que el planificador de §3.7 va a absorber, no un módulo aparte.

### 3.7 Planificador y publicación

`/marca/planificador` — **reusando `components/leads/agenda/calendar-grid.tsx`**, que ya resuelve la grilla de mes y semana con drag & drop nativo. Mover una pieza de día es arrastrarla, y eso ya está escrito.

`brand_content_items` es la tabla del pipeline: plataforma, tipo, título, idea, guion, caption, hashtags, estado (`IDEA` → `GUION` → `GRABADO` → `EDITADO` → `LISTO` → `PUBLICADO`), fecha planificada, ruta del archivo y, una vez publicado, el id de la pieza en `brand_posts`.

**Ampliación del SOC (§3.10).** El pipeline suma las columnas que hacen que una pieza publicada deje información y no sólo un número:

| Columna | Para qué | Regla del SOC |
|---|---|---|
| `objective` | `ALCANCE` \| `AUTORIDAD` \| `CONVERSION` — contra qué se va a medir | §16 |
| `hypothesis` | *"Probamos si [formato] aplicado a [tema] mediante [ángulo] rinde mejor porque […]"* | §12 |
| `hook`, `angle` | Las dos variables que más se mueven entre variantes de un cluster | §6, §14 |
| `parent_item_id` | De qué ganador desciende esta variante — el linaje del cluster | §13, §14 |
| `knowledge_id` | De qué nota de RADAR o de WINNERS salió la idea | §26 |

Y el calendario muestra dos cosas que antes no tenía: **la cuenta de la semana contra la cadencia base de 3–4 reels** (SOC §19) y **la mezcla exploración / explotación** — cuántas piezas son variantes de un ganador y cuántas son experimentos nuevos. El SOC §19 pide que ninguna de las dos llegue a cero, y verlo en la grilla es más barato que recordarlo.

> **El ciclo se cierra acá, no en la publicación.** Cuando la pieza publicada empalma con sus métricas y §3.11 la clasifica, el agente puede comparar el resultado contra la `hypothesis` que quedó escrita antes de grabar, y escribir la conclusión en `APRENDIZAJES` o en `LOSERS` (§3.12). Un experimento fallido con su hipótesis al lado vale; el mismo experimento sin hipótesis es sólo un reel que anduvo mal.

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

Lo que muestra: cadencia de publicación, mezcla de formatos, y **qué contenido de ellos explotó relativo a su propio promedio** — que es la única comparación que significa algo entre cuentas de tamaños distintos. Eso es exactamente el criterio de outlier del SOC §7, y es la razón por la que este paso sigue existiendo aunque el RADAR de §3.12 cubra terreno parecido.

**Competencia y RADAR no son lo mismo.** De un competidor seguimos la cuenta entera y con números reales, porque Apify la scrapea completa; en RADAR guardamos **una pieza suelta de cualquier creador de cualquier nicho** — el SOC §7 pide mirar formatos transferibles de negocios, educación o entretenimiento, no sólo cuentas de IA. Esa pieza entra por búsqueda web o pegando el link a mano, y sus números no están verificados.

> **Las views de una pieza externa que sale de una búsqueda web no son un dato.** Son lo que dice una página. Se guardan con `origen: mercado` y el SOC §24 obliga al agente a presentarlas como inferencia, nunca como hecho. La comparación contra el promedio del creador —lo que define un outlier— sólo es confiable en las cuentas que seguimos con Apify.

> **Sólo se ve lo público.** Likes, comentarios, views y caption sí; alcance, guardados, watch time y skip rate **no** — esas son privadas del dueño de la cuenta y ninguna herramienta las tiene. Confundir las dos listas hace que las comparaciones mientan, así que la pantalla muestra métricas propias y ajenas en bloques separados, nunca en la misma tabla.

> **Los ads quedan afuera, y no por falta de ganas.** La Ad Library API oficial de Meta se limitó a avisos políticos y de temas sociales de la Unión Europea, y está explícitamente documentada como no destinada a inteligencia competitiva. La alternativa sería scrapear la Ad Library con un actor de terceros: sería lo más frágil de todo el plan, sobre una página que Meta cambia seguido, y rompería sin aviso. Si más adelante aparece una fuente estable, entra como un paso nuevo detrás de la misma abstracción.

Cobra por resultado, igual que en Leads: al probar, `maxResults` chico.

### 3.9 YouTube — diferido

No se construye ahora. El tab se ve desde el primer día pero apagado, con el mismo criterio que los módulos del sidebar — la estructura se lee completa aunque no esté todo hecho (`CLAUDE.md` §2).

Para encenderlo hacen falta tres cosas, en orden: conectar YouTube en Windsor (pasa a ser la segunda fuente, así que obliga a un plan pago), escribir `lib/brand/sources/youtube.ts` implementando `BrandSourceProvider`, y agregarlo al registro.

**No hace falta tocar la UI.** Si al sumar YouTube se está editando una pantalla, la abstracción de §3.1 se rompió — mismo criterio que la receta de fuentes de leads en `CLAUDE.md` §9.

---

## Los tres pasos del Sistema Operativo de Contenido

Van numerados al final para no correr la numeración de los pasos ya escritos —hay comentarios en el código que citan `§3.2` y `§3.6`—, pero **se hacen antes que §3.7 y §3.8**. El orden real de trabajo es §3.10 → §3.11 → §3.12 → §3.7 → §3.8.

### 3.10 El prompt canónico

`Awareness_AI_Sistema_de_Contenido.md`, en la raíz, al lado del manual de marca. Regla de una línea, y es la que evita que el archivo se pudra:

> **El archivo es el prompt, no un documento sobre el prompt.** Todo lo que se escriba ahí se le manda al modelo en cada mensaje. Nada de notas al margen, TODOs, ni comentarios de implementación.

`lib/brand/ai/content-os.ts` lo lee del disco una vez por proceso y lo cachea a nivel módulo. Para que el archivo sobreviva al build hay que declararlo en `next.config.ts` — no hay ningún `import` que lo ate al bundle, así que el trace de salida no lo incluye solo y en producción el `readFileSync` tiraría `ENOENT`:

```ts
const nextConfig: NextConfig = {
  outputFileTracingIncludes: { "/*": ["Awareness_AI_Sistema_de_Contenido.md"] },
};
```

La alternativa —transcribir el texto a una constante de TypeScript— es exactamente lo que produjo la voz improvisada que estamos sacando: dos copias del mismo criterio que se separan en silencio. Una sola.

**Cómo se arma el mensaje, que es lo que define el costo:**

| Bloque | Dónde va | ¿Cachea? |
|---|---|---|
| El SOC completo | `system`, con `cache_control: { type: "ephemeral" }` | **Sí** — idéntico byte a byte entre mensajes |
| Estado del sistema — baseline, ganadores vigentes, experimentos abiertos | mensaje `{ role: "system" }` **dentro de `messages`**, después del turno del usuario | No hace falta |
| La pregunta | el turno del usuario | — |

El segundo bloque es la pieza que hoy no existe y la que evita que el prompt mienta: el SOC pide comparar contra el baseline propio (§16) y no presentar hipótesis como certezas (§24), así que el modelo necesita el baseline y la lista de ganadores **dentro del turno**. Meterlo arriba, en el `system`, rompería el caché en cada mensaje — el match es por prefijo y cualquier byte que cambie invalida todo lo que sigue. Los mensajes de sistema a mitad de conversación existen para esto y `claude-opus-5` los soporta; el bloque va después del mensaje del usuario, que es la posición que la API acepta.

**Costo.** El SOC son ~20 KB de markdown, del orden de 5.500 tokens. A US$5 por millón de entrada: escribirlo al caché cuesta ~US$0,034 una vez, y leerlo ~US$0,003 por mensaje — el 10% del precio de lista. Sin caché serían ~US$0,028 cada vez, diez veces más. Es la diferencia entre un prompt de este tamaño que conviene y uno que habría que recortar. (El mínimo cacheable depende del modelo y llega hasta 4.096 tokens; por debajo de eso el caché no se activa y no avisa. Con 5.500 estamos cómodos, pero si el documento se recorta a la mitad deja de cachear.)

El mismo texto pasa a ser el prompt de §3.5, en reemplazo de `buildRecommendationsSystemPrompt()`. Y `buildBrandVoicePrompt()` se borra.

Mientras §3.11 no exista, el bloque de estado se arma con lo que ya hay —totales del período y mejores piezas—; cuando exista, se enriquece sin tocar nada más.

> **Un system prompt no es documentación.** Cada línea que se le agregue compite por atención con el resto. Si algo se puede calcular —un promedio, un baseline, una fecha—, va en los datos del turno, no en el prompt.

### 3.11 Baseline propio y clasificación de resultados

`lib/brand/insights/` ya calcula patrones, pero no tiene la noción de *"esto rindió por encima de lo normal"*. Sin baseline, "ganador" es una opinión — y el SOC §16 es explícito: se compara contra el rendimiento propio, no contra otros creadores ni contra números absolutos.

`lib/brand/insights/baseline.ts`:

- **Mediana móvil, no promedio.** Una pieza que explotó arrastra el promedio y esconde al resto. La ventana son las últimas N piezas del mismo `kind` publicadas **antes** que la que se evalúa (N = 10), para que un reel se compare contra reels
- **Dos índices calculables**, uno por objetivo: *alcance* = `views` (o `reach` si no hay views) sobre su mediana; *autoridad* = `(saved + comments + shares) / reach` sobre la mediana de esa misma tasa
- **Clasificación** (SOC §17) con umbrales en constantes con nombre, no incrustados en una query: ≥ 1,5× → ganador, ≤ 0,6× → experimento fallido, en el medio → neutro. Son una decisión editorial y se van a mover
- **Muestra mínima: 5 piezas en la ventana.** Con menos se devuelve `SIN_BASELINE` y no se clasifica nada. Clasificar contra la mediana de tres posts es fabricar evidencia, y el SOC §24 pide justo lo contrario

**Qué se puede medir y qué no**, con los campos que el conector devuelve hoy (`lib/brand/sources/instagram.ts`):

| Señal del SOC §16 | Campo | Estado |
|---|---|---|
| Views, alcance, compartidos, guardados, comentarios | `media_views`, `media_reach`, `media_shares`, `media_saved`, `media_comments_count` | Disponible |
| Seguidores obtenidos por pieza | `media_follows` | Disponible |
| Tiempo medio de visualización, skip rate | `media_reel_avg_watch_time`, `media_reel_skip_rate` | Disponible |
| Visitas al perfil | `profile_views_1d` | Sólo a nivel cuenta, no por pieza |
| Alcance a no seguidores, retención inicial, % completado | — | **El conector no los devuelve.** No se estiman |
| DMs, leads, llamadas, oportunidades | — | **No existen en Instagram.** Ver abajo |

> **La conversión no se mide en esta fase, y eso es la regla de fases funcionando.** Leads, llamadas y clientes son el Gestor de Facturación (Fase 2), que no arrancó. Así que `GANADOR_CONVERSION` existe como valor pero sólo se marca **a mano** desde la ficha de la pieza, y queda un stub con la interfaz apuntando a la Fase 2 — mismo criterio que `lib/leads/goals.ts` (`CLAUDE.md` §2). Deducirla de proxies —comentarios que "parecen" un CTA— sería ruido con cara de dato.

**La clasificación se calcula, no se persiste.** No hay tabla nueva ni migración: se recalcula cada vez que entran métricas, que es lo correcto — una pieza puede dejar de ser ganadora cuando el resto de la cuenta sube. Lo que sí se guarda es *por qué* ganó, y eso es §3.12.

Aparece en tres lugares: el badge de la grilla y la ficha (§3.4), una columna en el análisis (§3.5), y el bloque de estado que el chat recibe en cada turno (§3.10).

**Decisiones de implementación** que el plan no fijaba (todas son constantes con nombre en `baseline.ts`):

- **`MADURANDO`.** Una pieza publicada hace menos de `MATURATION_DAYS` (3) no se clasifica. Las métricas son las del último snapshot, no las de una edad fija, así que un reel de ayer contra reels ya asentados saldría "fallido" por estar joven y dejaría de serlo en tres días. Tampoco entra al baseline vigente. Con `MATURATION_DAYS = 0` se desactiva
- **Ganador = cualquiera de los dos índices ≥ 1,5×** (el más alto decide cuál; empate → alcance). **Fallido = *todos* los índices disponibles ≤ 0,6×**: poco alcance con buena tasa de autoridad es un post que llegó a menos gente, no un experimento fallido
- **La ventana se llena con piezas que tienen la señal.** Una pieza sin datos no encoge la muestra en silencio; y una mediana en 0 no sirve de denominador, así que ese objetivo queda sin baseline
- **El sesgo que queda:** comparar el último snapshot de piezas de edades distintas favorece a las viejas. `MATURATION_DAYS` tapa lo peor; comparar a edad fija (views a los 7 días) requiere el historial de `brand_post_metrics` y queda como mejora si el badge se siente injusto
- **`GANADOR_CONVERSION` a mano queda diferido.** Marcarlo desde la ficha exige guardar la marca en algún lado, y este paso dice "sin migración". Por ahora es el valor del tipo y el stub `conversion.ts`; si se quiere el botón, es una columna en `brand_posts`

### 3.12 La base de conocimiento

SOC §26: nueve colecciones —`WINNERS`, `LOSERS`, `HOOKS`, `FORMATOS`, `TEMAS`, `AUDIENCIA`, `RADAR`, `EXPERIMENTOS`, `APRENDIZAJES`—. La decisión de diseño: **una tabla, no nueve.**

`brand_knowledge`:

- `collection brand_knowledge_collection` — el enum con las nueve
- `title text not null` y `body text` — la nota en prosa
- `data jsonb not null default '{}'` — lo propio de cada colección. La ficha de RADAR del SOC §7 vive acá entera: creador, link, plataforma, views, hook, ángulo, formato, estructura, payoff, emoción, núcleo transferible, qué no copiar
- `origin` — `PROPIO` | `MERCADO` | `HIPOTESIS`, obligatorio
- `status` — para `EXPERIMENTOS`: `PENDIENTE` | `ACTIVO` | `CONCLUIDO`
- `post_id`, `content_item_id` — el vínculo con la pieza propia cuando existe
- `tags text[]`, `owner_id`, timestamps

Una tabla porque las nueve tienen la misma forma —una nota con campos flexibles, de un usuario, buscable por texto— y porque nueve tablas serían nueve migraciones, nueve juegos de políticas y nueve tools. El `jsonb` absorbe lo que cada una tiene de propio, igual que `brand_posts.raw`.

Índices: `owner_id`, `(owner_id, collection)`, y GIN sobre `to_tsvector('spanish', title || ' ' || coalesce(body, ''))` para que el agente busque por texto sin traerse la tabla entera.

**Las tools nuevas**, que son lo que convierte una tabla en memoria:

| Tool | Qué hace |
|---|---|
| `buscar_conocimiento(collection?, texto?, limite)` | Lee. Es la primera llamada de cualquier turno que pida ideas (SOC §27) |
| `guardar_conocimiento(collection, title, body, origin, data?, post_id?)` | Escribe |
| `actualizar_conocimiento(id, …)` | Corrige, o cierra un experimento |

**No hay tool de borrado.** El SOC §26 termina con *"nunca borrar resultados negativos"*, así que el agente no recibe forma de hacerlo. Si algo está mal se corrige desde la UI.

`/marca/conocimiento` — una pantalla por colección, con la grilla de la biblioteca. No es opcional: una memoria que sólo el modelo puede leer es una caja negra, y el SOC §24 pide poder auditar de dónde salió cada afirmación.

**Decisiones de implementación** que el plan no fijaba:

- **La búsqueda es una columna generada, no un índice sobre la expresión.** PostgREST filtra por columnas, así que un GIN sobre `to_tsvector(...)` suelto no lo puede usar nadie desde `supabase-js`. `search` es `tsvector generated always as (...) stored` con el GIN encima, y se consulta con `.textSearch()`
- **Ignora acentos** (`spanish_unaccent`, migración `20260919130000`): la configuración `spanish` hace stemming pero no quita tildes, y buscar "automatizacion" no encontraba "automatización". Se probó contra la base antes de dar el paso por bueno
- **Sólo se busca en `title` y `body`.** Lo que vive en `data` (la ficha de RADAR) no entra al índice: `to_tsvector` sobre `jsonb` no es inmutable, y una columna generada lo exige. Por eso la descripción de `guardar_conocimiento` le pide al modelo poner lo esencial en `body`
- **`status` lo fuerza un check de la tabla**: obligatorio en `EXPERIMENTOS`, prohibido en el resto. Sin `status` un experimento no se puede saber si está abierto, y en otra colección sería un campo que miente
- **`actualizar_conocimiento` mezcla `data`, no lo reemplaza**, y no cambia la colección: corregir un campo no puede borrar los demás sin querer
- **Los ids se validan antes de escribir.** Un `post_id` inventado por el modelo rebota con un mensaje que le dice de dónde sacar uno real, no con una violación de foreign key
- **`buscar_conocimiento` recorta el `body` a 1.500 caracteres** y devuelve como máximo 15 notas: quince notas largas serían ~30k tokens en un solo `tool_result`
- **El bloque de estado de §3.10 ahora trae la base**: cuántas notas hay por colección, los experimentos abiertos con su id, y la prioridad de evidencia del SOC §18 repetida. Está en el turno y no en el prompt cacheado, por la regla de "si cambia, va en los datos"
- **La pantalla sí permite borrar** (con confirmación); el agente no. Es la diferencia entre "corregir desde la UI" y "el modelo no puede perder un resultado negativo". El `data` de cada nota se muestra pero no se edita a mano: lo escribe el agente
- **La ficha de una pieza muestra las notas vinculadas** (`post_id`): es el "por qué ganó" que §3.11 dejó para acá
- **Diferido:** el análisis de §3.5 sigue sin leer la base. Es una llamada de salida estructurada sin tools, y darle memoria sería otra decisión (¿tools en una llamada que hoy es determinista?). Cuando §3.7 traiga el ciclo de hipótesis, se decide

> **Escribir en la base desde una tool tiene un filo.** El modelo puede guardar una conclusión apresurada y leerla tres semanas después como si fuera un hecho establecido. Por eso `origin` es obligatorio y va en cada resultado de `buscar_conocimiento`, y el bloque de estado de §3.10 le repite la prioridad de evidencia del SOC §18 en cada turno: una nota de RADAR no pesa lo mismo que una métrica propia.

---

## Fases siguientes (fuera de alcance ahora)

- **Fase 4 — Panel principal.** Recién con los tres gestores vivos: agrega las métricas de las tres patas del negocio
- **YouTube** (§3.9) y **ads de la competencia** (§3.8), cada uno cuando exista la condición que hoy los bloquea

---

## Archivos principales

```
Awareness_AI_Sistema_de_Contenido.md         ← el system prompt, literal (§3.10)
next.config.ts                               ← outputFileTracingIncludes del .md
supabase/migrations/*.sql                    ← tablas de marca + RLS + Realtime
app/(app)/marca/page.tsx                     ← dashboard, tabs por plataforma
app/(app)/marca/contenido/page.tsx
app/(app)/marca/analisis/page.tsx
app/(app)/marca/generar/page.tsx             ← el chat
app/(app)/marca/ideas/page.tsx               ← ideas guardadas desde el chat (§3.6)
app/(app)/marca/conocimiento/page.tsx        ← las nueve colecciones (§3.12)
app/(app)/marca/planificador/page.tsx
app/(app)/marca/competencia/page.tsx
app/(app)/configuracion/page.tsx             ← + keys de Windsor y Anthropic
app/api/jobs/sync-marca/route.ts             ← cron, protegido por CRON_SECRET
components/shell/nav.ts                      ← available: true + children
components/brand/*                           ← tabs, grilla de contenido, chat
lib/windsor/client.ts                        ← REST, la key va en query string
lib/brand/sources/{types,registry,instagram}.ts
lib/brand/{actions,queries,sync}.ts
lib/brand/insights/*                          ← patrones y baseline, sin modelo
lib/brand/insights/baseline.ts               ← mediana móvil y clasificación (§3.11)
lib/brand/knowledge/{schema,queries,mutations,actions}.ts  ← la memoria (§3.12)
lib/brand/ai/content-os.ts                   ← carga el .md y arma el prefijo
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

**Sistema Operativo de Contenido (§3.10–§3.12)**

18. Pedirle una idea al chat: tiene que responder con la estructura del SOC §27 —idea, origen del patrón, hipótesis, métrica que la va a decidir— y no con una lista de veinte temas
19. Darle a propósito una idea débil y demasiado técnica: tiene que decir qué falla y dónde se perdería la atención (SOC §24), no mejorarla calladamente
20. **Verificar el caché:** a partir del segundo mensaje del hilo, `usage.cache_read_input_tokens` tiene que ser mayor que cero. Si da cero, algo variable se coló en el prefijo y cada mensaje está costando diez veces más
21. Con menos de 5 piezas del mismo tipo en la ventana, la biblioteca tiene que mostrar `SIN_BASELINE` en vez de una clasificación. Con más, cruzar el múltiplo de una pieza contra la mediana calculada a mano en SQL
22. Guardar una nota de RADAR desde el chat y verla en `/marca/conocimiento` con su `origin` y su fecha. Confirmar que el agente **no puede borrarla** — la tool no existe
23. **Cerrar el ciclo completo:** crear una idea con hipótesis, publicarla, sincronizar, y pedirle el análisis. Tiene que citar la hipótesis original y concluir si se cumplió o no
24. En producción, confirmar que el `.md` del SOC llegó al servidor — un `ENOENT` acá significa que falta `outputFileTracingIncludes` y el chat queda sin prompt

Cada `§3.x` se cierra con su propio checklist manual confirmado ítem por ítem en la app corriendo, antes de arrancar el siguiente — es la regla de `CLAUDE.md` §13 y acá pesa especialmente, porque una métrica mal mapeada no rompe el build: simplemente miente.

**Criterio de cierre de la Fase 3:** planificar un reel en la app, publicarlo desde la app, y una semana después entender en la app por qué funcionó o por qué no — sin abrir Instagram Insights en ningún momento del recorrido.
