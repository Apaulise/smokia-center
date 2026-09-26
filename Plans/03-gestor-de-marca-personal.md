# Awareness AI — Gestor de Marca Personal

## Context

> **Estado (2026-09-23): Fase 3 reabierta para §3.13, §3.14 y §3.15.** Construidos: §3.1–§3.6, §3.8 y §3.10–§3.12, con su verificación manual hecha. **Pendientes**: §3.7 (planificador y publicación) está implementado pero su checklist manual no se hizo — la publicación real en Instagram nunca se ejecutó, y desde el 2026-09-19 el usuario publica a mano, así que puede quedar sin probar por tiempo indefinido —; §3.9 (YouTube) queda diferido hasta que haya un plan de Windsor con una segunda fuente; y §3.13 (objetivo de seguidores) está **implementado el 2026-09-20 con el checklist manual hecho salvo los ítems 8 y 10** (piden publicar un reel real), así que no se da por cerrado. §3.14 (competencia accionable) se implementó sobre §3.8 ya en uso y **quedó cerrado el 2026-09-20 con su checklist manual confirmado ítem por ítem**. §3.15 (descubrir virales) está **implementado el 2026-09-23, probado en vivo contra Apify y Gemini reales, con el checklist manual todavía pendiente de confirmación**. Tampoco se hizo la parte de **Producción** de la verificación (despliegue, cron, `outputFileTracingIncludes`), que es el criterio de cierre real de la fase.

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

> **Estado (2026-09-19): implementado, verificación manual PENDIENTE.** Se verificó lo automático (typecheck, build, las reglas de Instagram, el aislamiento por usuario en Storage y en la tabla, y el empalme contra la base con datos temporales), pero el checklist en la app real no se hizo: se difirió a pedido para avanzar a §3.8. **La publicación real nunca se ejecutó contra Windsor** — el parseo de la respuesta y la resolución de la cuenta salen de la documentación y de una lectura de prueba. No se da el paso por cerrado (`CLAUDE.md` §13) hasta probarlo, empezando por una historia de prueba, que desaparece sola a las 24 h.

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

**Decisiones de implementación** que el plan no fijaba, y hallazgos que cambiaron el diseño:

- **Windsor ya publica los cuatro formatos.** El comentario de `instagram.ts` decía que sólo imágenes simples y pedía reconfirmar: se reconfirmó contra `GET /instagram/actions` y hay `create_image_post`, `create_video_post`, `create_story` y `create_carousel_post`, con las mismas restricciones de la tabla de arriba
- **La respuesta de una acción NO trae el id de lo publicado.** La documentación de Windsor sólo garantiza `{ "result": "<mensaje>" }`. El `runWindsorAction` original esperaba un `id` y habría lanzado error **después** de publicar en Instagram — la app diría "falló" con el post ya publicado. Ahora devuelve `{ message, externalId | null }` y busca el id en los campos habituales y dentro del mensaje. Sin id, `lib/brand/planner/link.ts` empalma la pieza con su `brand_posts` al sincronizar, por caption y ventana horaria (−10 min / +2 h), y **sólo si el candidato es único**: un empate no se enlaza, porque un empalme equivocado le pondría a una hipótesis las métricas de otra pieza. Las historias no se empalman (no entran a `brand_posts`)
- **El id de cuenta que Windsor pide para publicar no es el de lectura.** El `account_id` que devuelven los campos (`brand_accounts.external_id`) y el que Windsor espera en `account` son dos ids distintos (probado con la cuenta real). Se resuelve en el momento con `GET onboard.windsor.ai/api/common/ds-accounts`, por username o por la única cuenta conectada; no se guarda
- **Corte de red ≠ rechazo.** `WindsorActionError.definitive` distingue "Windsor contestó que no" (no se publicó nada, reintentar es seguro) de "no llegó respuesta" (la pieza pudo haber salido). En el segundo caso el candado `publish_started_at` **no se libera** y el mensaje manda a mirar Instagram antes de reintentar. El candado también frena el doble clic y vence a los 10 minutos por si el proceso murió a la mitad
- **El navegador sube directo a Storage.** Un video de cientos de MB no puede pasar por una Server Action (límite de cuerpo de Next y de Vercel), así que `MediaUploader` valida, sube con la sesión del usuario, y recién ahí llama a `attachItemMedia`, que **revalida en el servidor** con el tamaño y tipo que reporta Storage (no los del cliente) y borra el archivo si no pasa. Las reglas viven en `lib/brand/planner/rules.ts`, un módulo puro que corren el navegador (antes de subir) y el servidor (antes de publicar)
- **`media` es un array `jsonb`, no una ruta.** El plan hablaba de "ruta del archivo", pero un carrusel lleva de 2 a 10. Cada elemento guarda la ruta y lo medido al subir (tipo, tamaño, duración, dimensiones)
- **`PUBLICADO` no se elige a mano.** Lo pone la publicación. Una pieza publicada no se mueve, no cambia de tipo ni de fecha, y **no se elimina**: es el registro de la hipótesis con la que salió (mismo criterio que "nunca borrar resultados negativos", SOC §26). Sí se puede seguir editando la hipótesis y las notas
- **`CalendarGrid` pasó a genérico.** Recibe `items`, `getDay`, `renderChip` y `onMove` en vez de turnos y `moveAppointment`; la agenda de Leads le pasa lo suyo y no cambia. La navegación de período (`PeriodNav`, `ViewToggle`) se extrajo a `components/shell/calendar-nav.tsx` en vez de duplicarse
- **Las ideas del chat entran por la bandeja "Sin fecha"**, que además es zona de soltado: arrastrar una pieza ahí le saca la fecha. `/marca/ideas` redirige al planificador (la lista de sólo lectura de §3.6 era, a propósito, provisoria)
- **La cuenta de la semana** cuenta reels y videos con su fecha planificada (o la de publicación si ya salieron), aunque sigan en `IDEA`: ver el hueco a tiempo es el punto. En la vista de mes resume la semana de hoy, o la primera del mes si hoy no está en la grilla. La mezcla exploración/explotación sale de `parent_item_id`. Advierte si los experimentos llegan a cero, y si las variantes llegan a cero **sólo cuando hay un ganador vigente** (sin ganadores, cero variantes es lo esperable)
- **El ciclo se cierra con datos, no con tools nuevas.** Las piezas publicadas con hipótesis (con su clasificación de §3.11) viajan en el bloque de estado del chat y en la entrada del análisis de §3.5, y `metricas_de_post` devuelve la `pieza_planificada`. El análisis sigue siendo una llamada sin tools: se le da la hipótesis como dato, no acceso a la base
- **Storage:** el bucket `brand-media` está limitado a JPEG, MP4 y MOV. Se probó contra el proyecto real con dos usuarios: cada uno escribe sólo en su carpeta, no puede listar ni borrar lo del otro, y anon no puede escribir; la URL exacta se lee sin sesión, que es la excepción documentada arriba
- **Límite a vigilar: el tope de Supabase Free es de 50 MB por archivo, global.** El bucket declara 1 GB (el de Instagram) pero el proyecto lo puede recortar; un reel de un minuto en 1080×1920 suele pasar de 50 MB. Si `MediaUploader` muestra el mensaje de tamaño con un video que Instagram aceptaría, es esto
- **Sin reordenar carrusel:** las imágenes salen en el orden en que se subieron. Para cambiar el orden hay que sacar y volver a subir
- **`maxDuration = 60`** en la página, igual que el resto de `/marca`: una publicación de video puede rozar ese límite y no hay forma de saberlo hasta publicar uno

### 3.8 Competencia

`/marca/competencia` — las cuentas que se eligen seguir, con `brand_competitors` y `brand_competitor_posts`.

Reusa `lib/apify/client.ts` entero y el actor `apify/instagram-scraper` que ya usa `lib/providers/instagram.ts`, con el mismo esqueleto: job, corrida, paginado del dataset y reconciliación idempotente. No hay integración nueva que construir, sólo un mapeo distinto.

Lo que muestra: cadencia de publicación, mezcla de formatos, y **qué contenido de ellos explotó relativo a su propio promedio** — que es la única comparación que significa algo entre cuentas de tamaños distintos. Eso es exactamente el criterio de outlier del SOC §7, y es la razón por la que este paso sigue existiendo aunque el RADAR de §3.12 cubra terreno parecido.

**Competencia y RADAR no son lo mismo.** De un competidor seguimos la cuenta entera y con números reales, porque Apify la scrapea completa; en RADAR guardamos **una pieza suelta de cualquier creador de cualquier nicho** — el SOC §7 pide mirar formatos transferibles de negocios, educación o entretenimiento, no sólo cuentas de IA. Esa pieza entra por búsqueda web o pegando el link a mano, y sus números no están verificados.

> **Las views de una pieza externa que sale de una búsqueda web no son un dato.** Son lo que dice una página. Se guardan con `origen: mercado` y el SOC §24 obliga al agente a presentarlas como inferencia, nunca como hecho. La comparación contra el promedio del creador —lo que define un outlier— sólo es confiable en las cuentas que seguimos con Apify.

> **Sólo se ve lo público.** Likes, comentarios, views y caption sí; alcance, guardados, watch time y skip rate **no** — esas son privadas del dueño de la cuenta y ninguna herramienta las tiene. Confundir las dos listas hace que las comparaciones mientan, así que la pantalla muestra métricas propias y ajenas en bloques separados, nunca en la misma tabla.

> **Los ads quedan afuera, y no por falta de ganas.** La Ad Library API oficial de Meta se limitó a avisos políticos y de temas sociales de la Unión Europea, y está explícitamente documentada como no destinada a inteligencia competitiva. La alternativa sería scrapear la Ad Library con un actor de terceros: sería lo más frágil de todo el plan, sobre una página que Meta cambia seguido, y rompería sin aviso. Si más adelante aparece una fuente estable, entra como un paso nuevo detrás de la misma abstracción.

Cobra por resultado, igual que en Leads: al probar, `maxResults` chico.

> **Estado (2026-09-19): implementado y verificado.** Automático: typecheck, build, parseo de usuarios, mapeo de items, cálculo de outliers, y la base con dos usuarios. Manual: se corrió contra Apify real con dos cuentas (`@mavgpt` y `@danmartell`, 20 publicaciones cada una); la base confirma las corridas — 20 publicaciones por cuenta, con views, miniaturas y links, sin errores — y el input del actor y sus campos de salida resultaron ser los que dice la documentación. Se cruzaron los números contra Instagram y apareció un outlier real. Lo que no se probó con la app: que "Actualizar" sobre una cuenta ya traída muestre el costo corregido (ver abajo).

**Decisiones de implementación** que el plan no fijaba, y una premisa que había que corregir:

- **El actor NO es el de Leads.** El plan decía reusar "el actor `apify/instagram-scraper` que ya usa `lib/providers/instagram.ts`", pero ese proveedor usa `apify/instagram-hashtag-scraper` (busca por hashtag). Para seguir una cuenta se usa `apify/instagram-scraper` con `directUrls` + `resultsType: "posts"`. Es una constante (`COMPETITOR_ACTOR_ID`) y no una configuración: hay un solo actor válido para lo que se le pide
- **Sin webhook y sin service role.** El plan proponía "el mismo esqueleto" que Leads, pero ese esqueleto incluye el webhook, que es el único lugar del código donde el aislamiento depende del código y no de la base. Acá cada actualización la dispara una persona, así que se reconcilia con SU sesión (RLS protege igual que en cualquier consulta): `CompetitorPoller` llama a `reconcileCompetitor` al abrir la pantalla y cada 5 s mientras haya una corrida en curso. Es idempotente (upsert por `owner_id, competitor_id, external_id`), así que dos pestañas o un sondeo pisado no duplican nada. **La service role sigue sin entrar en la Fase 3**
- **El job vive en la fila del competidor**, no en una tabla aparte: hay una corrida por cuenta y no hace falta historial. Guarda `status`, `apify_run_id`, `last_run_started_at`, `last_cost_usd` y `last_error`. Una corrida que no termina en 60 minutos, o que Apify deja de devolver, se da por perdida para que el sondeo no espere para siempre
- **Cada actualización es manual y con el costo a la vista.** Apify cobra por resultado, así que no hay cron: agregar una cuenta y "Actualizar" muestran el costo estimado antes de lanzar (`COST_PER_1000_RESULTS_USD = 2.7`, el peor caso del plan Free), "Actualizar todas" pide confirmación con el total, hay un tope de 20 cuentas y una corrida ya vigente (30 min) no se relanza — un doble clic no paga dos veces. `results_limit` (1–100, default 30) es por cuenta y es lo que fija el costo
- **El costo que informa Apify al terminar se queda corto, y se corrigió.** Al probar con corridas reales, la app guardó US$ 0,0081 por 20 resultados y Apify reporta US$ 0,054 (20 × US$ 0,0027): `usageTotalUsd` no incluye todavía lo cobrado por evento cuando la corrida termina, porque esos cobros se contabilizan con demora. La estimación de arriba estaba bien; lo subestimado era el costo guardado, unas 6,7 veces. `ApifyRun.costUsd` ahora toma el mayor entre `usageTotalUsd` y `chargedEventCounts × eventPriceUsd` (que el actor ya tiene al terminar), y las dos filas guardadas se corrigieron con el dato real de Apify. **Leads no tiene el problema**: se comparó el `cost_usd` de sus corridas de Google Maps contra Apify y coincide, así que `lib/apify/reconcile.ts` (y con él el webhook) no se tocó. Lo único sin ver funcionando: que una corrida nueva de este actor ya guarde 0,054 en el momento de reconciliar, y no sólo después — se confirma la próxima vez que se apriete "Actualizar"
- **Las publicaciones ajenas son un snapshot**, sin historial diario: se pisan al actualizar. Guardar la evolución día a día pide una corrida diaria por cuenta, que es plata
- **Outlier = ≥ 2× la mediana de su propia cuenta y de su mismo grupo, con al menos 5 publicaciones en el grupo.** Los videos (reel, video) se comparan por views y las imágenes (post, carrusel) por likes, nunca mezclados: una imagen no tiene views y comparar sus likes contra views de reels no significa nada. El 2× es más exigente que el 1,5× de las piezas propias (`OUTLIER_THRESHOLD`, editorial y movible). Una mediana en 0 no sirve de denominador: ese grupo queda sin baseline. La pantalla muestra "lo habitual" de cada cuenta (mediana y `n`) para que el múltiplo se pueda auditar
- **Cadencia sobre lo que se ve.** Publicaciones por semana en los últimos 28 días, o sobre los días que alcance a abarcar lo traído: una cuenta que publica a diario agota el límite en 10 días, y dividir por 28 subestimaría su ritmo. Siempre se muestra "N publicaciones en M días" al lado, para que un ritmo calculado sobre pocos días no parezca más firme de lo que es
- **Likes ocultos.** Apify devuelve `likesCount: -1` cuando la cuenta oculta los likes: se guarda `null`, no `0` — no es un cero, es "no se sabe"
- **Propias y ajenas en bloques separados.** La tabla y "Lo que explotó" son sólo métricas públicas; "Tu cuenta, para comparar" es otro `Card` y sólo trae cadencia y mezcla, que es lo único comparable con lo que se ve de los demás
- **Las miniaturas caducan.** Las URLs de imagen del CDN de Instagram vencen a los pocos días, así que `PostThumb` cae a un placeholder si la imagen falla (también beneficia a la biblioteca propia)
- **Diferido:** las notas de RADAR (§3.12) siguen siendo un flujo aparte — una pieza suelta que entra por búsqueda o pegando el link. Un outlier de esta pantalla no se guarda solo en la base de conocimiento; sería una decisión nueva (¿botón "Guardar en RADAR"?) y no se tomó acá

### 3.14 Competencia accionable

> **Estado (2026-09-20): implementado y verificado.** Checklist manual confirmado ítem por ítem contra la app y contra Apify real. Dos cosas se arreglaron durante la verificación: las ideas de "Usar" se iban de tema (el prompt decía "no traduzcas el tema" y el modelo lo leyó como "cambialo": un reel sobre plugins de Claude generaba una pieza sobre nodos de n8n), y la foto de perfil resultó no estar en el payload del actor. Lo primero se corrigió en el prompt; lo segundo quedó documentado abajo como límite conocido.

> **Por qué existe este paso.** §3.8 se usó de verdad y ahí se vio lo que faltaba: la pantalla se leía pero no producía nada. Aparecían reels de hace un año, entraban outliers de temas ajenos al nicho porque el corte era puramente numérico, no había forma de sacar de la lista lo que no servía, y pasar una idea al planificador era copiarla a mano. Esto no cambia el criterio de §3.8 —outlier sigue siendo ≥2× la mediana de su propia cuenta—: le agrega qué se muestra de eso y qué se puede hacer con ello.

**1. Ventana de recencia.** `OUTLIER_MAX_AGE_DAYS = 60`, constante con nombre al lado de `OUTLIER_THRESHOLD` porque es la misma clase de decisión editorial. La ventana **no recorta el baseline**: la mediana se sigue calculando sobre todo lo traído de la cuenta, porque medirla sobre 60 días dejaría a las cuentas que publican poco por debajo de `MIN_BASELINE_SAMPLE` y no habría contra qué comparar. Un outlier sin fecha cuenta como **no reciente**: no se puede verificar. La recencia se marca en el `Outlier` (`recent`) y filtra la vista, no la consulta — el toggle "incluir anteriores" no vuelve al servidor.

**2. Relevancia, con el modelo barato.** Cada candidato reciente se puntúa de 0 a 100 según qué tan aprovechable es **para esta marca**, con un motivo de una frase. Por debajo de `RELEVANCE_MIN = 50` no entra en la lista. Tres decisiones:

- **Lo hace Gemini (`gemini-3.5-flash-lite`, free tier de Google AI Studio), no Claude.** Es una clasificación, no una pieza de contenido. La key se carga en Configuración como las otras, cifrada. Sin SDK: `lib/gemini/client.ts` es un fetch fino, espejo de `lib/windsor/client.ts`, y la salida se valida con Zod antes de usarse
- **El criterio no se escribe dos veces.** El system prompt es el SOC completo, que ya define nicho y voz. Una lista de palabras clave sería una segunda definición del nicho, y se desincronizaría con la primera el día que cambie el negocio
- **Degrada, no rompe.** Sin key, o si Gemini falla, las filas quedan con `relevance_score` null y **se muestran igual**: sin dato no se esconde nada. Corre solo al terminar de importar una cuenta, y hay un botón "Clasificar" para lo pendiente — la key se puede cargar después de haber importado

**3. Descartar.** La ✕ de la tarjeta escribe `dismissed_at`, no borra la fila: la próxima corrida la volvería a traer y el descarte se perdería. Es reversible desde "Ver descartadas", así que no pide confirmación.

**4. "Usar": un outlier ajeno → una pieza propia.** Un clic escribe una pieza con `title`, `kind`, `objective`, `hook`, `angle`, `hypothesis`, `idea`, `caption` y `hashtags` —los mismos campos que el diálogo del planificador ya edita— y la deja en la bandeja "Sin fecha", lista para arrastrar a un día.

- **Lo escribe Claude con el SOC como system prompt, en `claude-sonnet-5`.** Es lo que después se graba, así que la hipótesis y el ángulo se notan; pero es una pieza por clic, a pedido, y eso no justifica Opus
- **Se copia el mecanismo, no el tema** (SOC §7). El prompt lo dice explícitamente, porque es exactamente el error que esta pantalla invita a cometer
- **Se guarda de dónde salió**: `source_competitor_post_id` (FK, `on delete set null`) y `source_url` con el permalink copiado, que sobrevive a dejar de seguir la cuenta — que es justo cuando el link sigue haciendo falta. El diálogo del planificador muestra el link a la publicación original
- **No se paga dos veces.** Si ya hay una pieza hecha desde ese outlier, la acción la devuelve en vez de generar otra, y la tarjeta ofrece "Ver la idea"

**5. La tabla de cuentas.** `results_limit` editable por cuenta, con el costo estimado al lado: cambia lo que trae la **próxima** actualización y no relanza nada, porque relanzar sería cobrar sin que nadie lo pida.

> **La foto de perfil no se pudo traer, y es un límite del actor.** Se probó con `addParentData: true` y se miró el payload crudo de corridas reales: con `resultsType: "posts"`, `apify/instagram-scraper` devuelve `ownerId`, `ownerUsername` y `ownerFullName`, y **ninguna clave con la foto**. Así que el flag volvió a `false` y el avatar muestra la inicial. Queda la columna `profile_pic_url`, el lector defensivo (`pickProfilePicUrl`) y el componente con fallback: el día que se sume una corrida `resultsType: "details"` por cuenta —1 resultado extra, centavos— la foto aparece sin tocar nada más. No se hizo ahora porque es una corrida más que mantener por algo decorativo.

**Lo que este paso no hace:** los filtros son de la vista, así que "descartada" y el puntaje no achican la consulta; con muchas más cuentas habría que mover el corte a SQL. El puntaje tampoco se recalcula al cambiar el SOC — una pieza clasificada queda con el veredicto del día en que se clasificó.

### 3.15 Descubrir virales

> **Estado (2026-09-23): implementado, verificación manual PENDIENTE.** Probado en vivo contra Apify y Gemini reales durante la implementación (ver abajo), pero falta el checklist confirmado ítem por ítem por el usuario (`CLAUDE.md` §13) antes de dar el paso por cerrado.

**Por qué existe este paso.** §3.8/§3.14 sólo encuentran outliers en cuentas que el usuario eligió seguir a mano. Esto agrega una segunda vía, independiente de haber seguido a nadie antes: buscar por hashtag del nicho y traer reels que ya son virales. Se mezcla en el mismo tablero "Lo que explotó", con badge "Descubierto" y el `@usuario` de origen — no es una pantalla aparte.

**1. El actor, y un pivote sobre la marcha.** El plan original proponía reusar `apify/instagram-scraper` (el de §3.8) con `directUrls` apuntando a la página del hashtag en vez de a un perfil. Se probó contra Apify real (`#ai`, 24 resultados) y el actor devolvió el feed "reciente" del hashtag tal cual: 16 imágenes y 8 carruseles, **cero reels**. Es un actor de perfiles/hashtags genérico, no distingue por tipo de contenido cuando se le da una URL de tag. La alternativa que el plan ya dejaba anotada como salida —`apify/instagram-hashtag-scraper`, el mismo que usa Leads en `lib/providers/instagram.ts`— sí soporta `resultsType: "reels"`: probado con `#claudeai` (10 resultados) devolvió **10/10 reels**. Es la que quedó (`TREND_ACTOR_ID`), con `{ hashtags, resultsLimit, resultsType: "reels" }` como input — sin `directUrls`.

**2. El criterio es un piso absoluto de views, no relativo a un batch.** Primera versión trataba todos los reels descubiertos como un batch y los comparaba contra SU PROPIA mediana (≥`OUTLIER_THRESHOLD`, igual que competencia), con un piso de 5 tarjetas mínimo aunque no llegaran a ese múltiplo. A pedido, se simplificó: `TREND_MIN_VIEWS` es el único criterio — un reel descubierto cuenta como viral si supera ese piso de views, sin importar qué tan bien o mal le fue al resto de la búsqueda. Si una búsqueda no encuentra ninguno así, se muestran cero tarjetas: no se completa con views más bajas para llegar a un número. `computeTrendOutliers` (`lib/brand/trends/insights.ts`) sigue calculando un "×" de contexto (contra la mediana de views de todo lo reciente traído), pero es sólo para mostrar en la tarjeta — no filtra nada. Ventana de recencia propia y más chica que la de cuentas seguidas: `TREND_MAX_AGE_DAYS = 30` (vs. `OUTLIER_MAX_AGE_DAYS = 60`), porque "tendencia ahora" es más exigente.

**2.1. El piso bajó de 1M a 150k (2026-09-24), tras la primera prueba real de uso.** El usuario probó `#ai` en producción y no vio ninguna tarjeta nueva. Se investigó contra la base real: la búsqueda había corrido bien (`COMPLETADO`, sin error, reels importados con datos válidos) — el problema era el criterio. `apify/instagram-hashtag-scraper` trae el feed **reciente** del hashtag, no el "top" (confirmado con la documentación del actor: no tiene ningún parámetro para ordenar por popularidad). Cinco búsquedas reales (#ai ×3, #inteligeciaartifical, #claudeai) nunca superaron ~306k views — un reel recién publicado no tuvo tiempo de viralizarse, así que el piso de 1M dejaba la función devolviendo cero casi siempre. Se evaluó cambiar a `apify/instagram-search-scraper` con `searchType: "popular"` (apunta a `instagram.com/popular/<hashtag>`, que sí es contenido ya viral) para resolver esto del lado del actor en vez del criterio — **se descartó**: dos corridas reales de prueba fallaron con "blocked by Instagram / zero public details", no es viable hoy. Sin un actor de "top" disponible, se bajó `TREND_MIN_VIEWS` a 150.000 — apenas por encima del máximo real observado — para que la función encuentre algo con más frecuencia. Sigue siendo una decisión editorial que se puede volver a mover.

**3. Un bug que dejó una versión anterior de este criterio, y que se corrigió de paso.** El cálculo se hacía sólo sobre los posts **no descartados** — así que un outlier real que se descartaba desaparecía de la base de cálculo, dejaba de existir como `Outlier`, y "Ver descartadas" no lo encontraba para restaurarlo. `computeTrendOutliers` recibe TODOS los posts recientes (descartados incluidos, igual que `computeCompetitorInsights` en competencia): un outlier que se descarta se sigue calculando y queda marcado `dismissed`, recuperable como cualquier tarjeta de competencia. Se verificó en vivo: descartar y restaurar una tarjeta descubierta funciona.

**4. Modelo de datos.** `brand_trend_searches` (el job de una búsqueda, mismo rol que el estado de corrida en `brand_competitors`) y `brand_trend_posts` (los reels, con su propio `username`/`display_name` porque no hay fila de competidor detrás). `unique (owner_id, external_id)`: un reel que resurge en otra búsqueda se pisa, no se duplica. `brand_content_items.source_trend_post_id` es el calco exacto de `source_competitor_post_id`.

**5. Reuso, no reescritura.** Mismo settings key de Apify (no hay key nueva), mismo `classifyRelevance` de §3.14 (genérico, sin cambios), mismo `generateIdeaFromOutlier` para "Usar" (agnóstico del origen, sin cambios) — sólo escribe `source_trend_post_id` en vez de `source_competitor_post_id`. Sin webhook y sin service role, mismo criterio que competencia: cada búsqueda la dispara una persona y se reconcilia con su sesión.

**6. Verificado en vivo durante la implementación:** corrida real con `#claudeai` (10 resultados, ~US$0,027) trajo 10/10 reels; con el criterio de batch (versión anterior del punto 2) se vieron outliers descubiertos con badge "Descubierto" en el tablero, relevancia calculada por Gemini, y descarte/restauración funcionando. Con el piso absoluto de 1.000.000 views ya en su lugar, ninguno de los reels traídos en esas pruebas (el más alto: 705.914 views) lo alcanza, así que hoy el tablero no muestra ninguna tarjeta descubierta — es el comportamiento esperado, no un error. **Falta probar con un hashtag/momento que sí produzca un reel de un millón de views o más**, y —una vez con saldo de Anthropic repuesto— que "Usar" sobre esa tarjeta cree la idea con el link a la publicación original en el planificador.

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

### 3.13 Objetivo de seguidores, contador automático y próximos pasos

> **Verificación manual (2026-09-20): ítems 1–7, 9, 11 y 12 confirmados por el usuario; 8 y 10 pendientes** porque exigen publicar un reel real a mano, y el usuario lo hará después. La base, mirada después de los "ok": una sola meta `ACTIVA` y dos `ARCHIVADA` (ítem 3); dos sincronizaciones en 24 h, separadas por más de 6 h y ninguna duplicada ni colgada en `EN_CURSO` (ítems 4 y 5). **Ojo con el 9:** al mirar la base no había ninguna pieza con `post_id`, así que el "Desvincular" y la exclusión de posts ya enlazados no quedaron comprobados contra datos reales; se cubren con el ítem 8. **§3.13 no se cierra hasta el 8 y el 10.**
>
> **Estado (2026-09-20): implementado, checklist manual pendiente.** Migración aplicada (`20260919160000_brand_goals.sql`), `typecheck`, `build` y lint de los archivos tocados en verde. Verificado sin sesión de usuario: la lógica pura (18 casos, incluidos los bordes), las restricciones y RLS de la base (dentro de una transacción que se revierte) y el guard de la sincronización. **No verificado**: nada de lo que se ve en pantalla ni las acciones desde la app real — eso es el checklist de abajo. La sección "Decisiones de implementación" que sigue registra lo que el plan no fijaba.

**Qué se pidió.** Definir una meta de seguidores (ej. 10.000) y trabajar hacia ella con el ciclo del SOC: probar formatos con variantes hasta encontrar la idea ganadora y repetirla. Con tres cosas: la meta, los próximos pasos a seguir, y que el contador de seguidores se actualice solo.

**Decisiones del usuario**

- **Publica a mano desde Instagram**, no desde la app (probablemente por el audio en tendencia, que la API de publicación no permite elegir — sin verificar). El código de publicar de §3.7 **no se borra**: se apaga con un interruptor
- **Ganadora = alcance y views**: un video de 100 mil views tiene más chances de dejar seguidores que uno de 10 mil. Pero **no se descarta** el análisis "un video de 10 mil views dejó más seguidores que uno de 100 mil, para tener en cuenta": entra como **pista informativa** y nunca clasifica una pieza (`classifyPosts` sigue siendo por alcance y autoridad)
- **Seguidores por pieza = estimación por ventana posterior de 72 h**, rotulada como estimación

**Datos reales que condicionan el diseño** (leídos de Windsor y de la base)

- Seguidores el 2026-09-19: **49**, con sólo 2 días de historial propio. Windsor da únicamente el conteo **de hoy**, así que el ritmo sale de las fotos diarias de `brand_account_metrics.followers_count`
- `follower_count_1d` (seguidores nuevos por día) viene **null todos los días**. Probable causa: Instagram no lo entrega por debajo de 100 seguidores (sin verificar)
- `media_follows` (seguidores por pieza) viene **null en los reels y 0 en los carruseles**: **el dato directo no existe para reels**
- **El chequeo "al abrir `/marca` si la sync quedó vieja" que prometía §3.2 nunca se construyó.** Hoy el contador sólo se actualiza con "Sincronizar ahora"; el cron diario está en `vercel.json` pero la app no está desplegada
- `captured_on` es fecha **UTC**: una sync entre las 21 y las 24 h de Argentina cae en el día siguiente. Todo el cálculo nuevo usa días UTC para ser consistente; la sync no se toca

**Alcance**

1. **Migración.** `brand_goals` (`target_followers`, `baseline_followers`, `baseline_date`, `deadline` opcional, `status` `ACTIVA | CUMPLIDA | ARCHIVADA`) con RLS, y un índice único parcial que permite **una sola meta activa** por plataforma. Además, un índice único parcial sobre `brand_content_items.post_id`: una pieza por post
2. **Lógica pura en `lib/brand/goals/`**, testeable sin base:
   - `progress.ts`: avance, faltante, ritmo necesario (con plazo), ritmo real y fecha proyectada. **Con menos de 14 días de historial no se muestra ritmo** ("sin historial suficiente, N de 14 días"): antes que una proyección inventada. El ritmo usa la distancia real en días entre fotos, porque hay huecos si un día no hubo sync
   - `attribution.ts`: seguidores netos en las 72 h posteriores a publicar, marcados `ESTIMADO`, con aviso de **ventana compartida** cuando otra pieza propia salió dentro de las 72 h (con 3–4 reels por semana va a pasar seguido) y `DIRECTO` sólo donde Instagram sí da el dato (posts y carruseles). Suma "seguidores por cada 1.000 views" y detecta las **sorpresas**: piezas con ventana limpia cuya tasa duplica la mediana de las demás, con al menos 5 con dato
   - `next-steps.ts`: lista de máximo 6 pasos, **calculados y no opinados**: ritmo vs necesario, reels de la semana vs 3–4, exploración o explotación en cero, piezas planificadas sin hipótesis, piezas con fecha pasada sin vincular, piezas publicadas maduras sin conclusión, faltan reels para tener baseline, outliers de competencia sin usar, sync vieja
3. **Contador automático.** `syncBrandNow(platform, { onlyIfStale })` con el **guard en el servidor** (no sincroniza si hay una en curso de menos de 10 min, o una completada de menos de 6 h), disparado desde `BrandSyncPanel` al montar. Va desde una acción de cliente y **no** desde el Server Component, porque `runBrandSync` usa el cliente admin y `CLAUDE.md` §4 prohíbe la service role en un RSC. El techo real es **una foto por día**: Windsor es pull e Instagram da el conteo de hoy
4. **Meta en el dashboard.** `GoalCard` (medidor con el número siempre al lado: `49 de 10.000 · 0,5 %`) y `NextStepsCard` arriba de `/marca`, con un diálogo para definir la meta. **Antes de escribir el medidor, cargar la skill `dataviz`** (`CLAUDE.md` §12). La meta viaja al agente como **dato del turno** en el bloque de estado (junto a las sorpresas, rotuladas "estimación; evidencia débil, SOC §18) y no como texto del prompt cacheado
5. **Publicar a mano como flujo de primera clase.** `PUBLISH_FROM_APP_ENABLED = false` oculta "Publicar ahora" y "Archivo" y hace que `publishPlannerItem` rechace **del lado del servidor**. Nuevo **"Ya la publiqué"**: selector de posts propios recientes sin pieza enlazada y de formato compatible, que marca la pieza como publicada con la **fecha real del post**, más **"desvincular"** para deshacer (un empalme equivocado le pone a una hipótesis las métricas de otra pieza). Con eso el ciclo de la hipótesis funciona con piezas publicadas a mano; hoy sólo funciona con las publicadas desde la app. La ficha del post suma "Seguidores tras publicar", rotulada como estimación

**Límites que hay que tener presentes**

- Ritmo y atribución **necesitan fotos diarias**: sin despliegue y cron dependen de abrir la app
- Con ~50 seguidores, un solo seguidor de diferencia domina cualquier ventana de 72 h: la estimación es una pista de baja confianza hasta juntar semanas de datos, y hasta pasar los 100 seguidores, cuando probablemente empiece a llegar `follower_count_1d`

**Decisiones de implementación** que el plan no fijaba

- **Redefinir la meta es una función SQL, no dos llamadas.** `brand_define_goal` archiva la activa y crea la nueva en una transacción (`security invoker`, así que RLS y `WITH CHECK` siguen aplicando). Con dos llamadas separadas, un fallo entre ellas dejaría sin meta activa
- **`CUMPLIDA` la marca la sincronización** (cliente admin, ya autorizado por `owner_id`), no una lectura en un Server Component. Mientras tanto la tarjeta ya trata `seguidores ≥ meta` como cumplida
- **El "dos pestañas hacen una sola sync" lo garantiza un índice, no el código:** único parcial `brand_sync_jobs (owner_id, platform) where status = 'EN_CURSO'`. La segunda inserción rebota con `23505` y `runBrandSync` la devuelve como `skipped: "EN_CURSO"`. Una corrida que murió a la mitad bloquearía el índice para siempre, así que la migración y `runBrandSync` cierran como `FALLIDO` las `EN_CURSO` de más de 10 min
- **El guard de "reciente" vive en `runBrandSync`, pegado al insert del job** (`skipIfCompletedWithinHours`), no en `syncBrandNow`: cuanto más lejos del insert, más grande la ventana en que dos pestañas pasan las dos el chequeo. Sólo cuenta como reciente una corrida `COMPLETADO`: si Windsor está caído, cada apertura de `/marca` reintenta
- **Una pieza por post:** el índice común sobre `brand_content_items.post_id` (§3.7) se reemplazó por el único parcial
- **Ritmo:** se mide sobre las últimas 4 semanas entre la foto de esa altura y la última, con la distancia real en días. La historia son las fotos de la cuenta, no las posteriores a la meta: una cuenta con meses de fotos tiene ritmo desde el primer día de la meta. La proyección distingue tres casos (fecha, "no se llega" si el ritmo es ≤ 0, "más de 10 años")
- **Atribución en días UTC, con tolerancias:** la foto "de antes" es la más reciente hasta el día de publicación (a lo sumo 2 días antes) y la de "después" la más cercana a publicación + 3 días (±1). Como las fotos no tienen hora, una tomada *después* de publicar el mismo día deja la estimación por debajo de la real. Un hueco de sincronización da `SIN_DATOS`, nunca un número inventado. "Ventana compartida" es otra pieza a menos de 72 h en cualquier sentido; las historias no entran a `brand_posts` y por eso no marcan ventana compartida
- **Las sorpresas comparan sólo estimaciones entre sí** (no las mezclan con datos directos), exigen mediana de las demás > 0 y al menos 5 piezas con ventana limpia
- **"Outliers de competencia sin usar"** se interpretó como: hay outliers y ninguna pieza salió de una nota de RADAR (`knowledge_id`). El plan no lo definía; si se quiere más fino, hay que vincular cada outlier con su nota
- **"Próximos pasos" ordena por prioridad y corta en 6.** Los reels de la semana se cuentan igual que en el planificador (publicados registrados + planificados): un reel publicado a mano y no registrado no cuenta, y para eso está el paso "fecha pasada sin marcar como publicada"
- **"Desvincular" devuelve la pieza a `LISTO`** sin fecha ni post, sea cual sea el origen del vínculo (a mano o el empalme automático). Las notas de conocimiento ligadas al post no se tocan
- **Al agente le llega como dato del turno** el avance, el plazo, el ritmo (o la instrucción explícita de no inventarlo) y hasta 3 sorpresas rotuladas *estimación, evidencia débil*. No toca el prompt cacheado
- **Sin test runner en el repo:** la lógica pura se probó con un script descartable (`tsx`), no queda una suite. Si se agrega un runner, `lib/brand/goals/*` es lo primero que conviene cubrir

**Verificación manual** (`CLAUDE.md` §13, ítem por ítem, **y mirar la base después del "ok"**)

1. Definir la meta: una meta menor o igual a los seguidores actuales rebota; 10.000 con y sin plazo funcionan
2. La tarjeta muestra `N de 10.000 · %` y "sin historial suficiente", sin inventar un ritmo
3. Redefinir la meta archiva la anterior: nunca hay dos activas
4. Con la última sync de más de 6 h, abrir `/marca` actualiza solo y coincide con el número de la app de Instagram; reabrir enseguida **no** dispara otra (contar filas de `brand_sync_jobs`)
5. Dos pestañas abiertas a la vez hacen una sola sync
6. "Próximos pasos" coincide con el estado real y cada link lleva a donde dice
7. En el planificador no aparecen "Publicar ahora" ni "Archivo"
8. ⚠ Publicar un reel real a mano, sincronizar y usar "Ya la publiqué": la pieza queda `PUBLICADO` con la fecha real y la ficha del post muestra la hipótesis
9. El selector no ofrece posts ya enlazados ni de otro formato, y "desvincular" funciona
10. "Seguidores tras publicar" aparece rotulado como estimación, y con "ventana compartida" cuando corresponde
11. Celular: dashboard y planificador usables
12. *(Opcional, gasta tokens)* el chat cita la meta y el ritmo

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
app/(app)/marca/ideas/page.tsx               ← redirige al planificador (§3.7)
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
lib/brand/planner/{rules,schema,queries,actions,link,week}.ts  ← planificador y publicación (§3.7)
components/brand/planner/*                   ← calendario, diálogo de pieza, subida de archivos
lib/brand/competitors/{schema,mapper,insights,format,queries,actions}.ts  ← competencia (§3.8)
lib/brand/goals/{days,progress,attribution,next-steps}.ts  ← lógica pura de la meta (§3.13)
lib/brand/goals/{schema,queries,actions}.ts  ← meta, fotos del contador, publicación manual (§3.13)
lib/brand/competitors/relevance.ts           ← puntaje de nicho con el modelo barato (§3.14)
lib/brand/ai/outlier-idea.ts                 ← un outlier ajeno → una pieza propia (§3.14)
lib/gemini/client.ts                         ← fetch fino contra Google AI Studio (§3.14)
components/brand/competitors/outlier-board.tsx ← filtros, descartar y "Usar" (§3.14)
components/brand/goals/*                     ← GoalCard, NextStepsCard, diálogo, seguidores por pieza
components/brand/competitors/*               ← sondeo de corridas, alta, acciones por cuenta
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
