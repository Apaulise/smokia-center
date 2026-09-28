# Handoff: Awareness AI — Gestor de Marca Personal (rediseño)

## Overview
Rediseño visual del módulo **Gestor de Marca Personal** con el mismo sistema del Gestor de Leads. Son 7 pantallas: Resumen, Biblioteca, Detalle de pieza, Análisis, Planificador, Competencia y Base de conocimiento. La funcionalidad y el copy salen de la app actual. Lo que cambia es la capa visual: se reemplaza la paleta cian/violeta con cards muy redondeadas por la paleta oscura neutra con acento amarillo.

**Referencia:** `Marca personal.dc.html`. Cada pantalla es un frame de 1440 con su id: `#07A` a `#07G`.
**Tokens, tipografía, espaciado e iconos:** los mismos de `README.md`. No se agregan tokens nuevos.

## Instrucciones para la implementación
- Recrear **pixel a pixel** cada frame en el stack de la app, sin reinterpretar el diseño. Abrir el `.dc.html` al lado y comparar colores, espaciados, tamaños de fuente e iconos.
- Instalar **Host Grotesk** (400/500/600) y **JetBrains Mono** (400/500) desde Google Fonts. Iconos: `lucide-react`.
- Los datos (reels, cuentas, métricas, notas) son de ejemplo y se conectan a los datos reales.
- Las portadas de reels son placeholders rayados. En la app van las miniaturas reales con `object-fit: cover`, manteniendo la proporción indicada.

## Qué cambia respecto de la versión actual
| Antes | Ahora |
|---|---|
| Cian `#22D3EE` + violeta en números, barras, chips y CTAs | Neutros. Amarillo `#F2C14E` solo en: CTA primario, KPI "Seguidores" + barra de meta, "hoy" en el calendario, barra activa de la sidebar |
| Fondo con gradiente azul/violeta | `#161618` plano (app) sobre `#0C0C0D` |
| Cards con radio ~24px y borde azul | Radio **8px** en cards y **5px** en botones/inputs, borde `rgba(237,235,230,0.08)`, bg card `#141416` |
| Eyebrow cian "GESTOR DE MARCA PERSONAL" arriba de cada título | Header bar 56px con breadcrumb `Marca personal / {pantalla}` + meta Mono a la derecha |
| KPIs en cards separadas | Franja sin cards con divisores verticales (igual que Dashboard de Leads) |
| Barras cian 8px | Barras **3px**: track `#26262A`, relleno `#8A8C8F` (rojo `#D98A76` solo en "Para revisar") |
| Chips de estado de color (Madurando cian, etc.) | Chip con borde 1px y radio 4px: Madurando `#B8B6B0`/borde 0.14 · Neutro `#85837E`/borde 0.1 · Ganador `#8FAE8B`/borde verde 45% |
| Botones "Usar", "Nueva pieza", "Generar análisis" con gradiente cian | Un solo CTA amarillo por vista. El resto, botón secundario (borde 0.14, transparente) |

## Shell — `Sidebar.dc.html` (actualizado)
- Nuevos valores de `active`: `marca-resumen | marca-biblioteca | marca-analisis | marca-planificador | marca-competencia | marca-conocimiento`.
- Con una ruta de marca activa, "Gestor de Leads" se muestra como ítem cerrado y **Gestor de Marca Personal** se abre con sub-ítems: Resumen, Biblioteca (15), Análisis, Planificador (4), Competencia, Base de conocimiento (13). El ítem activo lleva texto 500 + barra amarilla 2px, igual que en Leads.
- Colapsada (56px): muestra los iconos de la sección activa: `layout-dashboard, clapperboard, chart-no-axes-column, calendar-days, radar, library`.
- Detalle de pieza usa `active="marca-biblioteca"`.

## Patrones comunes de las 7 pantallas
- **Header bar** 56px, padding 0 32px, borde inferior 0.06. Breadcrumb 12px `#85837E` / actual `#EDEBE6`. Meta derecha Mono 11px.
- **Encabezado de página**: eyebrow opcional (500 10.5px, 0.12em, `#85837E`), H2 500 28px −0.02em, sub 13px `#9A9893`. Acciones alineadas abajo a la derecha. Botones de 32–34px.
- **Card**: borde 0.08, radio 8, bg `#141416`. Cabecera con padding 16px 20px, borde inferior 0.06, título H3 500 15px + sub 12.5px `#9A9893`. Cuerpo con padding 18–20px 20px.
- **Label de métrica**: 500 10.5px 0.12em `#85837E`. **Valor**: Mono 22–26px −0.02em. Un valor vacío se muestra como "—" en `#65635F`.
- **Card de reel**: portada (3:4 en Resumen, 4:5 en Biblioteca), chip "Reel" arriba a la izquierda (bg `rgba(12,12,13,0.72)`, 10.5px), filas Views/Likes/Comentarios con icono 12px (`eye, heart, message-circle`) y valor Mono. Separador y "Watch time prom.". Un comentario en 0 va en `#65635F`. Hover: borde 0.2.
- **Miniatura de lista** (hooks, últimas piezas): 40×56 o 32×44, radio 4. Fila con hover `#1E1E21` y radio 5.
- Todos los números, fechas, porcentajes y handles de costo van en **JetBrains Mono**.

## Pantallas

### 07.A · Resumen
1. Encabezado: eyebrow `INSTAGRAM · @HANDLE`, H2 con el nombre de la marca. Botón secundario "Sincronizar ahora" (`refresh-cw`). Estado de sync en el header bar: punto 6px `#8FAE8B` + "Sincronizado · hace 1 h".
2. Grid 1:1:
   - **Meta de seguidores**: "118" Mono 30px amarillo + "de 10.000" + "1,2 %" a la derecha. Barra 4px con relleno amarillo (min 4px). 4 columnas: Faltan / Ritmo real / Ritmo necesario / A este ritmo. Delta verde "↑ 69 desde que la definiste". Nota al pie 12.5px `#85837E` con borde superior. Botón "Cambiar meta" (`target`, 30px).
   - **Próximos pasos**: filas con número en círculo 22px (borde 0.14, Mono 11), título 13.5px 500, link derecho "{cta} →" 12px `#9A9893` y cuerpo 12.5px. Divisores 0.06.
3. Franja KPI en 5 columnas: Seguidores (amarillo + marca 24×2px arriba + sub verde), Alcance 30d, Views, Interacciones 30d, Seguidos.
4. **Últimos reels**: 6 columnas, gap 12. Link "Ver toda la biblioteca →".
5. Grid 1:1 de gráficos de 160px de alto con grid de 3 líneas 0.06 y base 0.1:
   - **Curva de seguidores**: línea `#EDEBE6` 1.5px con punto final r3. Los días sin datos no se dibujan.
   - **Alcance e interacciones**: alcance `#B8B6B0` + área 8%. Interacciones `#8A8C8F` punteada 2/3. Leyenda en la cabecera y eje X Mono 10.5 `#65635F`.
6. **Audiencia**: 3 columnas (Edad %, Género %, Ciudades), gap 40. Fila: label + valor Mono y barra 3px proporcional al máximo de su grupo.

### 07.B · Biblioteca
- Filtros en línea: selects de 34px (bg `#1E1E21`, borde 0.12) Tipo / Ordenar por / Dirección, fechas Desde/Hasta con placeholder Mono `#65635F` e icono `calendar`, y botón secundario "Aplicar". A la derecha, "Mediana de referencia: 580 views". Borde inferior 0.08.
- Grilla de **5 columnas**, gap 14. Cada card lleva chip de estado + "N× la mediana" (Mono 11) arriba de las métricas y fecha Mono arriba a la derecha de la portada. Toda la card es link al detalle.

### 07.C · Detalle de pieza
- Breadcrumb "Biblioteca / Reel · fecha". Layout de 2 columnas: **340px** (portada 9:16, caption en párrafos 13px `#B8B6B0`, hashtags como chips Mono sobre `#1E1E21`, "Ver en Instagram" con `external-link`) y columna fluida.
- Encabezado: eyebrow "REEL · PUBLICADO {fecha}", H2 26px con el hook y "← Volver a la biblioteca".
- Cards: **Resultado contra tu baseline** (chip de estado + ratio Mono + explicación 13.5px + nota 12px). **Métricas** en grilla 3×3 con divisores internos 0.06. Grid 1:1 **Seguidores tras publicar** (barra de la ventana de 72 h) | **Evolución** (estado vacío). **Comentarios** (avatar 24px, autor 500, fecha Mono, texto, likes a la derecha).

### 07.D · Análisis
- Sub: "15 posts analizados · rango Mono". Único CTA amarillo: "Generar análisis" (`sparkles`).
- **Lectura del análisis** va primero. Son 3 columnas con divisor: Qué sabemos (`lightbulb`) / Qué sospechamos (`circle-help`) / Qué no sabemos todavía (`triangle-alert`). Cada ítem es un párrafo 12.5px con borde izquierdo 1px 0.1, sin viñetas.
- Grid 2×2 de cards de barras: Día y horario, Formato vs. guardados, Largo del caption, Hashtags (estado vacío).
- **Retención en reels**: 2 columnas, Mejores hooks (barra `#8A8C8F`) | Para revisar (barra `#D98A76`). La barra muestra el skip rate relativo y abajo va "0.4% skip rate · 12s promedio" en Mono 11.
- **Resultados contra tu baseline**: fila "Tu baseline hoy" + lista "Últimas piezas" con chip de estado.
- **Recomendaciones**: card con chips "Probar" (bg `#26262A`) + categoría (borde), título 15px y "NUEVA" Mono a la derecha. Cuerpo en 2 columnas: texto 13.5px | evidencia 320px (texto, miniaturas 52×72, "Llevar al planificador" secundario + "Descartar" texto).

### 07.E · Planificador
- Encabezado: eyebrow de conteo, H2 "Septiembre 2026" + flechas 28px + "Hoy". Segmented Mes/Semana (activo `#26262A`). CTA amarillo "+ Nueva pieza".
- Franja de 2 columnas: **Reels de la semana** "4 de 3–4" + "Dentro de la cadencia base" en verde · **Exploración / explotación** "3 nuevas · 1 variante".
- Layout de 240px + calendario:
  - **Sin fecha**: borde punteado 0.14, contador Mono y texto de ayuda. Es drop zone para las ideas guardadas desde el chat.
  - **Mes**: 7×5, lunes primero, celdas de min 104px con divisores 0.06. Días fuera del mes: bg `rgba(0,0,0,0.18)`, número `#4E4D4A`. **Hoy**: chip amarillo 22px con texto `#17150F`.
  - Pieza **publicada**: chip bg 0.07 + borde 0.14, `circle-check` verde 11px, título truncado con ellipsis (`min-width:0`). Link al detalle.
  - Pieza **planificada** (idea): borde punteado 0.22, eyebrow Mono "IDEA · RADAR" y título en 2 líneas.
- La vista Semana no está diseñada. Por ahora solo existe el toggle.

### 07.F · Competencia
- Acciones: "Actualizar todas" y "Buscar virales" (secundarios) + "+ Agregar cuenta" (amarillo). Costo de la última corrida en el header bar.
- Nota "Sólo se ve lo público.": bloque bg `#1C1C1F`, borde 0.08, radio 8, 12.5px. El copy va resumido; mantener el sentido.
- **Cuentas que seguís**: tabla sin card con columnas `2.4fr 1fr 1.2fr 80px 110px 150px 120px`: CUENTA (avatar 30px con inicial, handle 500, nombre, meta Mono 11), CADENCIA ("6,3 / sem" Mono, 0 en `#65635F`), MEZCLA, OUTLIERS, POR CORRIDA (runs + costo), ACTUALIZADA, acciones de icono 28px (actualizar / editar / eliminar con hover `#D98A76`).
- **Lo que explotó**: checkboxes "Incluir anteriores a 60 días" y "Ver descartadas 13". Grilla de 3 columnas con miniatura 92×164. En la card: "46,9×" Mono 15 500 + "su mediana", iconos abrir/descartar, chip "Relevancia 90", chip "Descubierto" si viene de hashtags, handle, views vs. habitual en Mono, caption en 2 líneas, fecha, y mecanismo 12.5px `#EDEBE6` con borde izquierdo. Pie: "¿Te sirve el mecanismo?" + botón secundario "Usar" (`sparkles`). Si ya se usó, el pie muestra la idea truncada + "Ver en el planificador →".
- **Tu cuenta, para comparar**: franja de 2 columnas, Cadencia | Mezcla de formatos con barra segmentada 4px (`#8A8C8F` / `#3A3B3E`).

### 07.G · Base de conocimiento
- Link "Ir al chat →" en el header bar. Encabezado con buscador 260px ("Buscar en {tab}") y "+ Nueva nota" (secundario).
- Tabs con contador Mono (Ganadores, Perdedores, Hooks, Formatos, Temas, Audiencia, Radar, Experimentos, Aprendizajes), mismo estilo que Memoria de ventas: activo en 500 con subrayado 2px `#EDEBE6`.
- Descripción de la categoría en 12.5px `#85837E` y lista de notas de máx 1000px:
  - **Nota cerrada**: chip de origen ("Propio", bg `#26262A`), fecha Mono, `chevron-down`, título 15px 500 y cuerpo con clamp de 2 líneas.
  - **Nota abierta** (clic en toda la card): bg `#1A1A1D`, chevron rotado 180°, cuerpo completo y pie con "Salió de: {pieza}" (link) + Editar / Archivar.

## Interacciones
- Hover de cards/links: borde a 0.2 o bg `#1E1E21`, con transición de 140ms.
- Biblioteca, Resumen, Análisis y Planificador: cada pieza lleva al Detalle de pieza.
- Próximos pasos: cada link lleva a la pantalla correspondiente (contador, pieza, competencia).
- Competencia "Usar": genera la pieza con IA y la deja en el Planificador. El pie de la card cambia al estado "Idea".
- Planificador: se pueden arrastrar piezas de "Sin fecha" a un día.
- Base de conocimiento: al cambiar de tab se colapsan las notas. Se abre de a una nota por vez.

## Estado
- `sidebarCollapsed`, `activeRoute`.
- Resumen: meta (objetivo, plazo, ritmo), KPIs, series diarias (seguidores, alcance, interacciones), audiencia.
- Biblioteca: `filters {tipo, orden, dirección, desde, hasta}`, piezas con estado (`madurando | neutro | ganador | fallido | sin_baseline`) y ratio contra la mediana.
- Planificador: `view` (mes|semana), `month`, piezas por fecha + sin fecha.
- Competencia: cuentas, outliers (`incluirAnteriores`, `verDescartadas`), estado de uso por outlier.
- Base de conocimiento: `activeTab`, `query`, `openNoteId`.

## Files
- `Marca personal.dc.html`: las 7 pantallas (frames 07.A–07.G).
- `Sidebar.dc.html`: actualizado con el submenú de marca.
- `README.md`: tokens y el resto del sistema.
