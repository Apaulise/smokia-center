# Manual de identidad visual — Awareness AI

**Versión:** 1.0  
**Propósito:** Mantener una presencia visual coherente, reconocible y premium en redes, presentaciones, sitio web, propuestas y piezas comerciales.

---

## 1. Esencia de marca

Awareness AI transforma procesos cotidianos en sistemas más ágiles, medibles y fáciles de operar mediante inteligencia artificial y automatización.

### Personalidad visual

- **Inteligente y clara:** tecnología explicada sin parecer inaccesible.
- **Eléctrica y dinámica:** transmite impulso, velocidad y posibilidad.
- **Minimalista:** cada elemento tiene una función; no se decora por decorar.
- **Premium y confiable:** acabados sobrios, alto contraste y composición limpia.
- **Humana:** la tecnología acompaña a las personas y los negocios; no los eclipsa.

### Sensación que debe dejar

> “Esto se ve moderno, serio y capaz de hacer que mi negocio funcione mejor.”

---

## 2. Dirección creativa

La identidad combina una base oscura, profunda y profesional con energía eléctrica cyan y violeta. La luz aparece como un acento controlado: halos suaves, líneas de flujo, destellos discretos y degradados limpios.

**Palabras clave:** dark-tech, precisión, flujo, conexión, eficiencia, energía, claridad, automatización.

### Sí usar

- Fondos negro-azulados con degradados ambientales suaves.
- Cyan y violeta como fuentes de luz o acentos funcionales.
- Amplio espacio negativo.
- Bordes sutiles, transparencias y brillos contenidos.
- Grillas, conexiones abstractas o ondas de energía muy discretas.
- Fotografías o rostros nítidos, con fondo limpio y separación luminosa.

### Evitar

- Estética cyberpunk saturada, neón excesivo o fondos recargados.
- Íconos de robot, cerebros, circuitos o códigos como recurso decorativo genérico.
- Más de un efecto protagonista por pieza.
- Gradientes arcoíris o colores cálidos dominantes.
- Sombras pesadas, bevels, 3D plástico o efectos de “gaming”.
- Texto pequeño sobre zonas de alto brillo.

---

## 3. Paleta de color

La proporción es más importante que la cantidad de colores: la base oscura debe dominar. Cyan y violeta iluminan, no invaden.

| Rol | Color | HEX | Uso recomendado |
|---|---|---:|---|
| Fondo principal | Negro profundo | `#070B17` | Fondos, videos, portadas, secciones hero |
| Fondo secundario | Azul noche | `#0C1730` | Tarjetas, degradados, bloques secundarios |
| Superficie | Azul pizarra | `#12213E` | Paneles, contenedores, tablas y overlays |
| Cyan eléctrico | Cyan core | `#18D6E8` | CTA, datos clave, iconos, líneas y acentos |
| Cyan suave | Aqua glow | `#72F4F1` | Destellos, hover, halos ligeros |
| Violeta eléctrico | Violet core | `#7C3AED` | Énfasis, títulos puntuales, gradientes |
| Púrpura profundo | Purple depth | `#4C1D95` | Transiciones y zonas de profundidad |
| Texto principal | Blanco frío | `#F4F7FF` | Titulares y texto sobre fondos oscuros |
| Texto secundario | Gris azulado | `#AAB8D4` | Cuerpo, etiquetas, metadata |
| Líneas y bordes | Azul translúcido | `#2B416D` | Separadores, bordes de tarjetas |

### Proporción orientativa

- **70%** fondos oscuros (`#070B17` / `#0C1730`)
- **20%** blanco frío y grises de lectura
- **7%** cyan eléctrico
- **3%** violeta eléctrico

### Gradiente principal

Usar para hero sections, CTAs destacados, highlights y trazos luminosos.

```css
linear-gradient(135deg, #18D6E8 0%, #4C7DFF 45%, #7C3AED 100%)
```

### Gradiente ambiental

Debe ser muy sutil; funciona detrás de una persona, un título o una tarjeta.

```css
radial-gradient(circle at 72% 30%, rgba(24, 214, 232, .16), transparent 34%),
radial-gradient(circle at 25% 75%, rgba(124, 58, 237, .18), transparent 38%),
#070B17
```

---

## 4. Tipografía

La tipografía debe comunicar precisión y cercanía. Evitar fuentes futuristas difíciles de leer.

| Uso | Tipografía preferida | Alternativa | Peso |
|---|---|---|---|
| Titulares | **Sora** | Space Grotesk | 600–700 |
| Cuerpo / UI | **Inter** | Manrope | 400–500 |
| Datos o código puntual | **JetBrains Mono** | IBM Plex Mono | 400–500 |

### Reglas de composición

- Titulares cortos, directos y con aire: 3–8 palabras cuando sea posible.
- Usar mayúsculas solo en etiquetas, navegación o microcopy breve.
- Evitar párrafos largos en imágenes y reels; priorizar una idea por pantalla.
- Interlineado generoso: **1.35–1.5** en titulares y **1.5–1.7** en cuerpo.
- Nunca combinar más de dos familias tipográficas en una pieza.

### Jerarquía sugerida para piezas digitales

| Nivel | Tamaño orientativo | Estilo |
|---|---:|---|
| H1 | 48–72 px | Sora semibold/bold, blanco frío |
| H2 | 32–44 px | Sora semibold |
| H3 | 22–28 px | Sora semibold o Inter semibold |
| Cuerpo | 16–18 px | Inter regular, gris azulado |
| Etiqueta | 12–14 px | Inter medium, mayúsculas con espaciado leve |

---

## 5. Efectos eléctricos

Los efectos representan el movimiento de un proceso que se ordena y acelera. Deben guiar la mirada, nunca competir con el contenido.

### Glow controlado

- Aplicar glow principalmente detrás de un objeto, persona, CTA o número importante.
- Opacidad recomendada: **10–30%**.
- Bordes suaves, sin contornos duros.
- Preferir un color dominante por foco: cyan **o** violeta; mezclar ambos solo en una transición amplia.

```css
box-shadow: 0 0 22px rgba(24, 214, 232, .28),
            0 0 58px rgba(124, 58, 237, .14);
```

### Líneas de energía

- Trazos finos de 1–2 px, curvos o rectos, con poca opacidad.
- Usarlos para conectar concepto, resultado o pasos; no como patrón de fondo dominante.
- Un máximo de 2–4 líneas visibles por composición.

### Bordes luminosos

- Tarjetas y marcos con borde azul translúcido.
- En hover o elemento destacado, iluminar suavemente el borde en cyan.
- Radio recomendado: **16–24 px** para contenedores digitales.

### Motion

- Animaciones lentas y fluidas: 2–6 segundos, easing suave.
- Buenos recursos: pulso de halo, flujo leve de gradiente, trazos que se desplazan, aparición por opacidad.
- Evitar parpadeos, glitches agresivos, shakes y animaciones repetitivas de alta frecuencia.

---

## 6. Composición y layout

### Principio general

**Una idea principal + un apoyo visual + un llamado a la acción.** Si hay más de una idea, convertirla en carrusel, secuencia o segunda pantalla.

### Retícula y espaciado

- Usar retículas ordenadas; alinear texto, tarjetas y elementos clave.
- Priorizar márgenes amplios: el vacío es parte de la estética premium.
- Sistema de espaciado sugerido: **8 / 16 / 24 / 32 / 48 / 64 px**.
- En piezas verticales, mantener el contenido crítico dentro de una zona segura central para no interferir con UI de Instagram/TikTok.

### Tarjetas y módulos

- Fondo: `#0C1730` con 75–92% de opacidad.
- Borde: 1 px `#2B416D` o cyan al 25–40% de opacidad.
- Sombra: difusa, fría y discreta.
- Nunca usar tarjetas con demasiados elementos internos. Agrupar o dividir.

---

## 7. Fotografía y retratos

### Estilo recomendado

- Retratos nítidos, naturales y seguros; mirada a cámara o trabajando en contexto.
- Iluminación limpia con acento cyan/violeta muy suave detrás o lateral.
- Fondo negro-azul, gris oscuro o desenfocado; nunca competir con el rostro.
- Vestimenta lisa y sobria: negro, blanco, gris, azul noche. Un acento cyan/violeta es opcional.

### Tratamiento de imagen

- Preservar colores de piel naturales.
- Contraste medio/alto, negros profundos y nitidez moderada.
- Separar el sujeto del fondo con halo suave; no recortar con borde duro de neón.
- Aplicar degradado oscuro sobre fotografía si llevará texto encima.

---

## 8. Iconografía e ilustración

- Íconos lineales y geométricos, de 1.5–2 px de grosor visual.
- Preferir símbolos de flujo, mensaje, calendario, dashboard, rayo sutil, conexión o check.
- Usar cyan para acción y violeta para categoría/énfasis.
- Evitar estilos mezclados: no combinar emojis, ilustraciones 3D caricaturescas e íconos lineales en una misma pieza.

---

## 9. Aplicaciones prácticas

### Redes sociales

**Reels y shorts**

- Fondo oscuro o imagen real con overlay oscuro.
- Titular grande en blanco; una o dos palabras clave en cyan o violeta.
- Subtítulos claros, con resaltado de palabra clave en cyan.
- Reservar el glow para el titular, mockup o punto de atención principal.

**Carruseles**

- Portada: una promesa concreta, máximo dos líneas, mucho contraste.
- Interior: alternar explicación limpia y visuales de apoyo.
- Cierre: CTA en tarjeta o botón con gradiente principal.

### Presentaciones y propuestas

- Portada oscura con glow ambiental y mensaje corto.
- Una métrica o idea principal por slide.
- Tablas simples, con filas separadas por bordes discretos.
- El cyan indica acción/resultado; el violeta, proceso/innovación. Mantener esa convención de forma consistente.

### Web / landing page

- Hero: fondo negro profundo + gradiente ambiental + CTA cyan/violeta.
- Mantener legibilidad AA como mínimo: texto blanco sobre fondos oscuros y evitar cyan como texto de párrafo.
- Botón principal: degradado; botón secundario: borde azul translúcido.
- Usar motion solo para reforzar jerarquía o feedback de interacción.

---

## 10. Recetas rápidas

### Fondo para una portada

1. Base `#070B17`.
2. Agregar un radial cyan al 12–16% de opacidad detrás del elemento principal.
3. Agregar un radial violeta al 12–18% en la esquina opuesta.
4. Incorporar, si hace falta, una línea de energía o retícula extremadamente tenue.
5. Colocar título blanco y resaltar solo una palabra con el gradiente principal.

### Tarjeta de beneficio

1. Superficie `#0C1730`.
2. Borde de 1 px `#2B416D`.
3. Ícono cyan lineal.
4. Título blanco + texto gris azulado.
5. Glow cyan bajo solamente si es el beneficio principal.

### Imagen de perfil / retrato

1. Rostro nítido y sin modificación de rasgos.
2. Fondo oscuro con degradado cyan/violeta difuminado.
3. Glow suave detrás del sujeto, no alrededor del contorno.
4. Sin logos, texto ni elementos tecnológicos llamativos.

---

## 11. Checklist antes de publicar o diseñar

- [ ] ¿La pieza se entiende en menos de tres segundos?
- [ ] ¿Hay un único foco visual principal?
- [ ] ¿Predomina la base oscura y los acentos no superan aproximadamente el 10%?
- [ ] ¿El cyan y el violeta tienen una función clara, en lugar de ser decoración?
- [ ] ¿El texto es legible en móvil?
- [ ] ¿Los efectos eléctricos son sutiles y no parecen genéricos o excesivos?
- [ ] ¿La composición conserva aire y alineación?
- [ ] ¿La pieza se siente moderna, confiable y humana?

---

## 12. Prompt base para imágenes y fondos

Usar este prompt como punto de partida al generar recursos visuales:

> Fondo minimalista dark-tech para Awareness AI, base negro/azul muy oscuro con degradados ambientales suaves en cyan eléctrico, violeta y púrpura. Efectos de energía abstractos y sutiles: halos difuminados, líneas de luz finas y reflejos tecnológicos discretos. Estética premium, moderna, limpia y profesional; alto contraste, amplio espacio negativo, composición equilibrada. Sin texto, sin logos, sin robots, sin patrones recargados, sin cyberpunk exagerado, sin elementos futuristas invasivos.

---

## 13. Regla final

Si una pieza necesita explicar que es tecnológica mediante muchos efectos, está mal resuelta. La tecnología debe sentirse por la precisión, el orden, el contraste y la claridad.
