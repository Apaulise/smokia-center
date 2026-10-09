# Handoff: SmokIA — Gestor de Leads (rediseño)

## Overview
Rediseño visual del módulo **Gestor de Leads** de SmokIA: shell con sidebar, Dashboard, Listas + detalle de lista, Detalle de lead (con Copilot IA), Agenda y versión Mobile. Objetivo: pasar de la estética actual (azul marino con glow cian, tarjetas redondeadas por todos lados) a una interfaz oscura, sobria y densa, tipo herramienta de trabajo, con **un único acento amarillo** por vista.

## About the Design Files
Los archivos `.dc.html` de este paquete son **referencias de diseño hechas en HTML**: prototipos que muestran el aspecto y comportamiento buscados, **no código de producción para copiar**. La tarea es **recrear estos diseños en el entorno existente de la app** (su framework, router, librería de componentes, sistema de estilos y fetch de datos), siguiendo sus patrones. No hay que portar el runtime de los `.dc.html` (`support.js`, `<sc-for>`, `<sc-if>`, `{{ }}`, `<dc-import>`); son solo la forma de dibujar el mock.

Para abrirlos: servir la carpeta con un servidor estático (`npx serve .`) y abrir cada `.dc.html`. Cada archivo muestra varios "frames" (1440, 1024, estados vacío / cargando / modal) etiquetados arriba en monospace (p. ej. `02.A · DASHBOARD · 1440 · CON DATOS`).

## Fidelity
**Alta fidelidad (hi-fi).** Colores, tipografía, espaciado, bordes y copy son finales. Recrear pixel a pixel usando las librerías de la app. Los datos (nombres de leads, números, mensajes de chat, notas del Copilot) son de ejemplo: conectarlos a los datos reales.

---

## Design Tokens

### Colores
| Token | Hex | Uso |
|---|---|---|
| bg/canvas | `#0C0C0D` | fondo detrás de la app |
| bg/app | `#161618` | superficie principal |
| bg/sidebar | `#141416` | sidebar, tab bar mobile |
| bg/raised | `#1E1E21` | inputs, buscador, modales, cards elevadas |
| bg/composer | `#1C1C1F` | bloque composer IA |
| bg/selected | `#26262A` | segmento activo, burbuja propia, menús |
| text/primary | `#EDEBE6` | texto principal |
| text/secondary | `#9A9893` | texto secundario, ítems de nav |
| text/tertiary | `#85837E` | labels, eyebrows, meta |
| text/muted | `#65635F` | deshabilitado, métricas en 0 |
| text/soft | `#B8B6B0` | cuerpo sobre fondos oscuros, línea de "Contactos" |
| accent | `#F2C14E` | **un solo dato por vista**, CTA primario, indicador activo, "hoy" |
| accent/hover | `#F6CE6A` | hover del CTA primario |
| on-accent | `#17150F` | texto sobre amarillo |
| positive | `#8FAE8B` | deltas positivos (↑) |
| danger | `#D98A76` | acciones destructivas ("Eliminar lista…") |
| chart/neutral-1 | `#3A3B3E` | barra "Nuevo", "Sin rubro" |
| chart/neutral-2 | `#8A8C8F` | resto de barras, progreso |
| border/strong | `rgba(237,235,230,0.14)` | botones secundarios |
| border/default | `rgba(237,235,230,0.08)` | divisores de sección, bordes de card |
| border/subtle | `rgba(237,235,230,0.06)` | filas de tabla, header bar |
| hover/row | `rgba(237,235,230,0.04–0.05)` o `#1E1E21` | hover de filas / nav |
| overlay | `rgba(12,12,13,0.66)` | detrás de modales y ⌘K |

Regla clave: **el amarillo no es decorativo**. Solo: CTA primario, indicador de ítem activo (barra de 2px), el KPI que "se mueve" en el período, "hoy" en calendario, puntaje de interés del Copilot, señales de compra. Las etapas del embudo se distinguen por **forma y posición, no por color**.

### Tipografía
- **Host Grotesk** (400/500/600) — UI y titulares. Google Fonts.
- **JetBrains Mono** (400/500) — todos los números, fechas, horas, atajos de teclado, eyebrows de frame.
- `-webkit-font-smoothing: antialiased`.

| Rol | Spec |
|---|---|
| Título de página (H2) | Host Grotesk 500, 28px, letter-spacing -0.02em |
| Título lead (detalle) | 500, 26px, -0.02em |
| Título de sección (H3) | 500, 15px |
| Eyebrow / label de sección | 500, 10.5–11px, letter-spacing 0.12em, MAYÚSCULAS, `#85837E` |
| Cuerpo | 13–13.5px, line-height 1.5–1.6 |
| Meta / secundaria | 11.5–12.5px |
| KPI grande | JetBrains Mono 400, 34px/1, -0.03em, tabular-nums |
| Número etapa | Mono 20px/1 |
| Interés Copilot | Mono 36px/1, amarillo |
| Números en tablas | Mono 12–13px |

### Espaciado / radios / sombras
- Escala usada: 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32, 36, 40px.
- Padding de contenido de página: `28px 32px 40px`. Header bar: alto 56px, padding horizontal 32px (28px en detalle).
- Gaps entre secciones del dashboard: 36px.
- Radios: 2px (barras), 3–4px (chips, kbd), **5px (botones, inputs)**, 6px (segmented, menús), 8px (cards, modales, composer). Mobile: tarjetas 8px, input chat 22px (pill), frame 44px.
- Sombras: solo en flotantes. Modal/⌘K `0 16px 48px rgba(0,0,0,0.45)`; menú ⋯ `0 12px 32px rgba(0,0,0,0.4)`; tooltip `0 8px 24px rgba(0,0,0,0.4)`.
- Transiciones: 140ms en background/color de hover.

### Iconos
Lucide (`lucide-static@0.460.0` en el mock; en la app usar `lucide-react` o equivalente). Tamaños 13–16px desktop, 16–20px mobile. Usados: `search, plus, users, layout-grid, layout-dashboard, rows-3, calendar, calendar-plus, calendar-arrow-down, book-open, receipt, megaphone, settings, log-out, panel-left-close, chevron-left/right, sparkles, message-circle, mail, phone, map-pin, arrow-up, sun`.

---

## Screens / Views

### 01 · Shell (Sidebar) — `Sidebar.dc.html`
- **Expandido**: 232px, bg `#141416`, borde derecho `border/default`.
  - Header 56px: logo (`assets/logo-dark.png`, alto 26px) + "Smok**IA**" (AI en `#9A9893`) + botón colapsar (`panel-left-close`).
  - Buscador 32px, bg `#1E1E21`, placeholder "Buscar o ejecutar…", kbd `⌘K` (Mono 10.5px, borde 1px).
  - Nav (ítems 30px de alto, 13px): "Panel principal" (deshabilitado, tag "pronto"), **Gestor de Leads** (padre, `#EDEBE6` 500) con sub-ítems indentados sobre una línea vertical: Dashboard, Listas (`6`), Generar lista, Agenda (`1`), Memoria de ventas. "Gestor de Facturación" (pronto), "Gestor de Marca Personal".
  - Ítem activo: texto `#EDEBE6` 500 + **barra amarilla 2px** a la izquierda (top/bottom 7px). Contadores en Mono 11px.
  - Footer: Configuración + avatar 24px (iniciales) + email truncado + icono salir.
- **Colapsado**: 56px, solo iconos 32×32 con tooltip (title), barra activa amarilla a la izquierda. Se usa en ≤1024px.
- Props: `active` (dashboard|listas|generar|agenda|memoria|config), `collapsed`.

### 01.B · Command palette ⌘K — en `Dashboard.dc.html`
Modal 600px centrado a 96px del top, bg `#1E1E21`, borde 0.12, radio 8. Input 52px con cursor amarillo. Grupos LEADS / LISTAS / ACCIONES con eyebrow. Resultado activo: bg `rgba(242,193,78,0.1)` + barra amarilla 2px. Footer con atajos: "↑↓ navegar · ↵ abrir · ⌘↵ abrir en panel". Acciones con atajo de dos letras (G L = generar lista, N T = nuevo turno).

### 02 · Dashboard — `Dashboard.dc.html`
Estructura (1440): header bar (breadcrumb "Gestor de Leads / Dashboard", derecha "Actualizado hace 2 min" Mono 11px) → contenido:
1. **Encabezado**: eyebrow "RESUMEN · SEPTIEMBRE", H2 "Dashboard"; a la derecha segmented `7d | 30d | 90d` (activo bg `#26262A`) y CTA amarillo "+ Generar lista" (34px).
2. **Franja KPI** (sin cards, divisores verticales, borde top/bottom): Leads totales `195` · **Contactados `26` en amarillo** con marca amarilla 24×2px arriba y delta verde "↑ 18 vs. período ant. · 13% del total" · Agendados `2` · columna compacta con métricas en 0 ("Cerrados ganados 0", "Tasa de conversión —", nota "Aparecen al primer cierre.").
3. **Pipeline**: 8 columnas (Nuevo → Cerrado ganado) con conversión entre etapas arriba (`17% →`, Mono 10.5px), nombre, número y barra de altura **logarítmica** (72px máx). "Nuevo" usa `#3A3B3E`, resto `#8A8C8F`, etapas en 0 → barra rayada. Link "+5 etapas en 0" con tooltip. A la derecha, separado con borde punteado, "FUERA DEL EMBUDO": Ahora no / Cerrado perdido / Descartado + nota de retorno.
4. **Grid 2:1**: gráfico de líneas "Contactos y cierres" (180px, grid cada 40px, línea contactos `#B8B6B0` + área 8%, cierres amarillo) | "Distribución por rubro" (barra apilada 8px + leyenda con % + link "Asignar rubro a 175 leads →").
5. **Rendimiento por lista de origen**: tabla (LISTA, FUENTE, RUBRO·ZONA, LEADS ↓, CONTACT., CERR., TASA CONTACTO con barra 3px).
6. **Experimentación de aperturas** (estado vacío en una línea + botón secundario "Probar variantes").
7. **Grid 2 col**: "Próximas reuniones" (fecha Mono, nombre, tipo, hora, "Abrir") | "Sin tocar hace +7 días" (filas hover `#1E1E21`, "Retomar →" hover amarillo).
- **1024**: sidebar colapsada, mismo contenido reflowed.
- **Vacío (cuenta nueva)**: KPIs en línea en `#65635F`, bloque "PRIMER PASO" con texto 22px y CTAs "Generar lista" (primario) + "Importar CSV".
- **Cargando**: skeletons con shimmer ("humo"): gradient `#1E1E21 → #2E2E32 → #1E1E21`, `background-size: 800px`, animación `background-position -400px → 400px` 1.6–2s linear infinite.

### 03/04 · Listas + detalle de lista — `Listas.dc.html`
- Header: H2 "Listas" + "Elegí una lista para trabajar sus leads.", filtro 220px, toggle Tabla/Grilla, CTA "Generar lista".
- **Tabla** por defecto: NOMBRE (500), FUENTE, RUBRO, CREADA ↓ (Mono), LEADS, CONTACTADO (barra 3px + %), ESTADO (punto con forma distinta según estado), menú `⋯`.
- Menú ⋯ (168px): Renombrar, Asignar rubro, Exportar CSV, divisor, "Eliminar lista…" en `#D98A76`.
- Vista grilla opcional (3 col, celdas con outline 1px, hover `#1C1C1F`).
- Detalle de lista: la etapa de cada lead se lee con **medidor de 5 segmentos** (forma y posición, no color). Ver frames en el archivo.

### 07 · Detalle de lead — `Lead Detail.dc.html`
- Header bar: breadcrumb Listas / {lista} / {lead}; derecha "12 / 30" y botones `K` `J` (anterior/siguiente lead con teclado).
- Encabezado: nombre 26px; **selector de estado** (botón 28px con icono de progreso + "Respondió ▾") + "etapa 3 de 9" + dirección + link a lista. Acciones rápidas (32px, secundarias): WhatsApp, Email (deshabilitado si no hay), Llamada, Agendar.
- **Tres columnas**:
  - Izquierda (248px): CONTACTO (teléfono Mono, web, rating, dirección, email "+ Agregar"), RUBRO Y ORIGEN, AGENDA, PRÓXIMA ACCIÓN, NOTAS (con "Guardado · fecha").
  - Centro: **Composer contextual** (un solo bloque, cambia según etapa): eyebrow "SIGUIENTE PASO" + instrucción; textarea; canal segmented (WhatsApp/Email/Llamada); atajo `⌘↵`; botón amarillo con `sparkles`. Debajo, ACTIVIDAD con filtros Todo/Mensajes/IA y timeline (fecha/hora Mono a la izquierda, línea vertical, punto; burbujas de mensaje; acciones inline).
  - Derecha (320px): **Copilot** — INTERÉS `7/10` (amarillo, 10 ticks), ENRIQUECIMIENTO (Qué hacen / Canales / Ángulo), DOLORES (chips borde sólido), OBJECIONES (borde punteado), SEÑALES DE COMPRA (chip amarillo; hover muestra tooltip con evidencia citada + canal + hora).
- **1024**: Copilot se pliega a un riel de 52px (icono, puntaje, texto vertical "COPILOT · 3 SEÑALES").
- **07.C Composer — modos**: Sin contacto → *Apertura* (variantes A/B, ángulo, texto editable, contador de caracteres, "Regenerar", "Copiar y abrir WhatsApp"); *Cargando IA* (shimmer + "Leyendo reseñas y web…" + Cancelar); *Respondió* → Analizar respuesta. Ver archivo para el tercer modo.

### 05 · Agenda — `Agenda.dc.html`
- Header bar con "Exportar .ics" a la derecha.
- Encabezado: eyebrow "2 REUNIONES · 1 RECORDATORIO", H2 "Septiembre 2026" + flechas + "Hoy"; segmented Mes/Semana/Lista; CTA "+ Nuevo turno".
- Grilla mes 7×6 (lunes primero), celdas min 96px, días fuera de mes con bg `rgba(0,0,0,0.18)` y número `#4E4D4A`. **Hoy**: número en chip amarillo. Eventos: reunión = chip bg 0.07 + borde 0.14; recordatorio "ahora no" = chip transparente con borde, texto secundario. Hora Mono 10.5px.
- Panel derecho 320px: "PRÓXIMA · EN 3 DÍAS" (nombre, tipo, Cuándo/Etapa/Origen, botones "Unirse a Meet" y "Abrir lead"), "PARA PREPARAR" (notas IA numeradas), "DESPUÉS" (lista).
- **05.B Nuevo turno** (modal 480px): Lead (autocompletar con etapa), Fecha + Hora·duración, Tipo (Diagnóstico / Reunión de propuesta / Seguimiento), Lugar (Meet / Presencial / Llamada), checkbox "Mover el lead a “Reunión” al guardar", Cancelar + "Agendar".

### Mobile — `Mobile.dc.html` (390×844)
- Tab bar inferior (4): **Hoy** (`sun`), **Leads** (`users`), **Agenda** (`calendar`), **Memoria** (`book-open`). Activo `#EDEBE6`, inactivo `#65635F`, 48px de alto + safe area 28px.
- **M.1 Hoy**: logo + fecha + botón buscar 36px; titular 26px con resumen en lenguaje natural ("5 leads esperan respuesta…"); 3 KPIs (Contactados en amarillo); card "Próxima reunión"; lista "Sin tocar hace +7 días" (filas ≥52px, chevron 44×44).
- **M.2 Leads**: buscador 40px, chips de etapa con contador (scroll horizontal), filas 68px con punto de estado (forma/relleno por etapa; Reunión en amarillo), FAB amarillo 52px (Generar lista).
- **M.3 Detalle**: back + "12 / 30", nombre, selector de estado, 3 acciones (WhatsApp / Llamar / Maps, 48px), hilo de chat (propio `#26262A`, recibido `#1E1E21`), nota Copilot con borde punteado, composer fijo abajo: chips de modo (Responder con IA / Analizar / Agendar) + input pill 44px + enviar amarillo.
- **M.4 Agenda**: strip de 7 días desde hoy (hoy en amarillo, punto bajo días con evento), lista cronológica.
- Hit targets ≥44px.

---

### 04 · Generar lista — `Generar lista.dc.html`
- Layout 2 columnas: formulario (máx 720px) + panel derecho 360px.
- **Fuente**: dos tarjetas seleccionables (Google Maps / CSV · manual). Seleccionada: borde `rgba(237,235,230,0.4)`, bg `#1E1E21`.
- Campos (inputs 38px, bg `#1E1E21`, borde 0.12, focus borde `rgba(242,193,78,0.6)`): Qué buscar, Zona, Cantidad máxima (slider 5–100, default 20, ayuda "Apify cobra por resultado. Empezá chico (5–20) para probar."), Nombre de la lista (autocompletado "{rubro} · {zona}"), Rubro a asignar (select).
- Panel derecho: BÚSQUEDA (preview Mono de la query), COSTO (estimado grande Mono 30px, crédito restante y después), LISTAS PARECIDAS (rendimiento de listas con mismo rubro/zona + aviso de duplicados), CTA amarillo "Generar lista ⌘↵" al pie.
- **04.B CSV**: archivo cargado + tabla de mapeo columna origen → campo destino con % de completitud; columnas no reconocidas "— ignorada" en `#65635F`; CTA "Importar N leads".
- **04.C Generando**: contador "12 / 20", barra 3px, resultados apareciendo en vivo (duplicados atenuados), fila shimmer al final, "Cancelar" / "Ir a Listas". No bloquea: el usuario puede navegar.

### 06 · Memoria de ventas — `Memoria de ventas.dc.html`
- Header con buscador 240px y "+ Agregar a mano". Tabs con contador: Todo / Objeciones / Dolores / Señales de compra / Aperturas (activo: texto 500 + subrayado 2px `#EDEBE6`).
- Maestro-detalle: lista 520px (tipo en eyebrow, título, frecuencia Mono, última vez; seleccionado con barra amarilla 2px y bg 0.04) | detalle: tipo, título 22px, meta (leads, rubro, etapa típica, último visto), "CÓMO RESPONDE EL COPILOT" (bloque editable bg `#1C1C1F` + métrica de uso), EVIDENCIA (citas textuales con lead, canal y fecha, link al lead), acciones "Unir con otra" / "Archivar".
- Estado vacío: explica que la memoria se arma al analizar respuestas.

### 08 · Login — `Configuracion.dc.html` (frames 08.A/B)
Basado en el componente **AuthUI de 21st.dev** (`components/ui/auth-ui.tsx`: split 2 columnas, formulario 350px, toggle sign in/up, PasswordInput con ojo, "Or continue with" + Google, panel derecho con cita en Typewriter). Instalarlo como indica 21st (deps: clsx, lucide-react, tailwind-merge, @radix-ui/react-slot, @radix-ui/react-label, class-variance-authority, tw-animate-css) y **adaptarlo**:
- Traducir copy: "Ingresá a tu cuenta" / "Usá tu email para continuar." · "Creá tu cuenta" / "Completá tus datos para empezar." · Email, Contraseña ("¿La olvidaste?" solo en ingresar), Nombre completo (solo en crear) · "Ingresar" / "Crear cuenta" · "¿No tenés cuenta? Crear cuenta" / "¿Ya tenés cuenta? Ingresar" · "o continuá con" · "Continuar con Google".
- Botón submit: variante primaria amarilla (`bg #F2C14E`, texto `#17150F`, hover `#F6CE6A`), no `outline`. Google: outline.
- Inputs 40px, radio 5px (no el `--radius: 1rem` del snippet: usar `--radius: 0.3125rem`), bg `#1E1E21`, borde `rgba(237,235,230,0.12)`, focus borde amarillo 60%.
- Título 26px/500 alineado a la izquierda (el original centra; acá va a la izquierda). Logo + "SmokIA" arriba a la izquierda, "© 2026 SmokIA" abajo.
- Panel derecho: en vez de foto, bg `#141416` con grilla sutil 48px (líneas 0.035), logo grande centrado (`assets/logo-dark.png`, 340px alto), degradado inferior a `#141416`. Pasar por props `signInContent.quote = { text: "Cada conversación, un paso más cerca del cierre.", author: "SmokIA" }` y `signUpContent.quote = { text: "Tu próxima lista de clientes empieza acá.", author: "SmokIA" }`. Cita 22px, cursor del Typewriter en amarillo. Si se prefiere foto, reemplazar `image.src`.
- Tema shadcn (`.dark`): `--background: #161618`, `--foreground: #EDEBE6`, `--muted-foreground: #9A9893`, `--border/--input: rgba(237,235,230,0.12)`, `--primary: #F2C14E`, `--primary-foreground: #17150F`, `--accent: #1E1E21`.
- Mobile (<768): solo formulario, inputs/botones 48px.

### 09 · Configuración — `Configuracion.dc.html` (frame 09.A)
- Subnav izquierda 200px: Negocio, Integraciones, IA, Etapas del pipeline, Cuenta. Contenido máx 760px, secciones separadas 40px con título 15px + descripción.
- **Negocio**: filas clave/valor (Nombre, Qué ofrecés, Cliente ideal, Firma) con "Editar" — la IA usa estos datos.
- **Integraciones**: Apify · Google Maps (crédito restante, estado "Crédito bajo" con punto amarillo, "Recargar"), WhatsApp, Google Calendar (Conectado, punto verde `#8FAE8B`), Email SMTP (Sin conectar).
- **IA**: Tono (Formal/Cercano/Directo), Tratamiento (Vos/Tú/Usted), Variantes por apertura, toggle "Enriquecer al importar".
- **Cuenta**: perfil + "Cambiar contraseña"; "Eliminar cuenta" en `#D98A76`.

## Interactions & Behavior
- **⌘K** abre la command palette desde cualquier pantalla; ESC cierra.
- **K / J** en detalle de lead: lead anterior / siguiente dentro de la lista.
- **⌘↵** en composer: ejecutar acción IA.
- Selector de estado en el header del lead cambia la etapa; el composer se adapta a la etapa (sin contacto → Apertura; respondió → Analizar; "ahora no" vencido → Seguimiento).
- Agendar desde Nuevo turno puede mover el lead a "Reunión".
- Hover: filas de tabla/listas bg `#1E1E21` o `rgba(237,235,230,0.04)`; botones secundarios bg `rgba(237,235,230,0.05)`; CTA amarillo → `#F6CE6A`. 140ms.
- Loading: shimmer "humo" (ver Dashboard cargando y composer cargando).
- Responsive: ≥1280 sidebar expandida; ≤1024 sidebar en iconos y Copilot en riel; <768 layout mobile con tab bar.
- Métricas en 0 se agrupan/atenúan en vez de ocupar espacio completo.

## State Management
- `sidebarCollapsed` (persistido), `activeRoute`.
- Dashboard: `period` (7d|30d|90d), métricas agregadas, etapas del pipeline, series diarias, rendimiento por lista, reuniones, leads sin tocar.
- Listas: `viewMode` (tabla|grilla), `filter`, `sort`.
- Lead: `stage`, `composerMode` (derivado de la etapa), `channel`, `draft`, `aiLoading`, datos de Copilot (interés, enriquecimiento, dolores, objeciones, señales con evidencia).
- Agenda: `viewMode` (mes|semana|lista), `cursorMonth`, eventos (reuniones + recordatorios "ahora no"), `selectedEvent`, form de nuevo turno.
- Palette: `query`, resultados agrupados, `activeIndex`.

## Assets
- `assets/logo-dark.png` — logo para fondos oscuros (usado en sidebar y mobile).
- `assets/logo-light.png` — logo para fondos claros.
- Iconos: Lucide. Fuentes: Google Fonts (Host Grotesk, JetBrains Mono).

## Files
- `Sidebar.dc.html` — shell/nav (expandida y colapsada).
- `Dashboard.dc.html` — dashboard 1440/1024, vacío, cargando, ⌘K.
- `Listas.dc.html` — listas (tabla, grilla, menú) y detalle de lista.
- `Lead Detail.dc.html` — detalle de lead 1440/1024 + modos del composer.
- `Agenda.dc.html` — agenda mes + modal nuevo turno.
- `Mobile.dc.html` — 4 pantallas mobile.
- `Generar lista.dc.html` — Google Maps, CSV con mapeo, generando.
- `Memoria de ventas.dc.html` — maestro-detalle + vacío.
- `Configuracion.dc.html` — login (desktop interactivo + mobile) y configuración.
- `support.js` — runtime solo para visualizar los mocks (no portar).

