# Fixes visuales — Gestor de Leads

## Context

Durante el uso real del Gestor de Leads (Fase 1) aparecieron tres problemas visuales en el shell de la app (sidebar) y en textos de tarjetas/formularios. No son parte de un `§x` del plan de fase — son bugs puntuales sobre lo ya construido — pero se documentan como plan chico en `Plans/` porque tocan varios archivos y conviene dejar registro de la causa encontrada.

Investigación hecha antes de este plan:
- Se auditó `components/ui/card.tsx`, `components/leads/generar-form.tsx`, `app/globals.css` y el resto de `components/ui/`: **no hay ningún color hardcodeado en negro** en el código. Todo el texto hereda `--color-ink` (blanco, `#F4F7FF`) desde `body` o usa `text-muted` explícito.
- El usuario confirmó que el texto poco legible persiste en incógnito y en otro navegador (descarta extensiones), y prefirió no revisar configuración de accesibilidad de Windows (alto contraste / filtros de color) por ahora. Como no se pudo reproducir la causa exacta en el código, el fix de este ítem es **endurecimiento defensivo**: dejar de depender de herencia de color y fijar el color explícito donde falta, más estilizar el popup nativo de `<select>` (que el navegador pinta con sus propios colores, fuera del control normal del CSS de la app). Si el problema persiste después, el siguiente paso sería revisar Configuración > Accesibilidad de Windows.
- El bug del sidebar "roto" al scrollear sí tiene causa confirmada en el código (ver Bug A).

---

## Bug A — La barra lateral se corta al scrollear en pantallas largas

**Causa confirmada:** en `app/(app)/layout.tsx:16` el contenedor raíz es `flex min-h-dvh lg:flex-row` (altura mínima, crece con el contenido). El `<aside>` en `components/shell/sidebar.tsx:65-70` tiene `lg:h-dvh` (alto fijo = un viewport) pero **no es `sticky` ni `fixed`** — es un hijo más del flujo normal del documento. Cuando el contenido de `<main>` (dashboard, listas largas) es más alto que un viewport, al scrollear hacia abajo el `<aside>` completo se desplaza junto con la página y, como mide exactamente `100dvh`, "se termina" después de un viewport de scroll — quedando el resto de la página con fondo vacío donde debería seguir la barra. Es lo que se ve en la segunda captura: "Configuración/Salir/email" aparecen arriba de todo y debajo queda espacio vacío en vez de la barra.

**Fix:** en `components/shell/sidebar.tsx`, agregar `lg:sticky lg:top-0` a las clases del `<aside>` (línea ~68), junto al `lg:h-dvh` que ya tiene. Así la barra queda anclada al viewport mientras `<main>` scrollea de forma independiente, sin importar cuánto contenido tenga.

---

## Bug B — Títulos y labels poco legibles (endurecimiento defensivo)

1. **`components/ui/card.tsx:39`** — `CardHeader` renderiza `<h3 className="truncate text-base">{title}</h3>` sin color explícito, dependiendo de heredar `--color-ink` del `body`. Se usa para títulos como "Generar lista", "Contactos y cierres", "Distribución por rubro". Fix: agregar `text-ink` explícito a esa clase.
2. **`components/ui/select.tsx`** — el `<select>` en sí ya tiene `text-ink` (línea 12), pero sus `<option>` no tienen estilo propio: el popup desplegado lo pinta el navegador/SO con sus colores por defecto, pudiendo mostrar texto oscuro sobre fondo claro (u otra combinación fuera de la paleta de marca) según el sistema. Fix: agregar en `app/globals.css` una regla dirigida a `option` dentro de `select` (algo como `select option { background-color: var(--color-surface); color: var(--color-ink); }`), que la mayoría de navegadores Chromium/Firefox respeta para el popup nativo.

No se tocan `page-header.tsx`, `stat-tile.tsx`, `empty-state.tsx`, `button.tsx` ni los labels de `generar-form.tsx` — ya usan `text-ink`/`text-muted` explícito, están bien.

---

## Feature — Colapsar la barra lateral a una franja de íconos

Objetivo: en desktop, poder achicar el sidebar a una franja angosta con sólo íconos (sin texto), para ganar ancho en pantallas como Lista de leads. Un botón lo vuelve a expandir.

**Cambios en `components/shell/sidebar.tsx`:**
- Nuevo estado `collapsed` (`useState`), inicializado leyendo `localStorage.getItem("awareness-ai:sidebar-collapsed")` en un `useEffect` (para no romper hydration — arranca `false` en el render del servidor/primer render y se ajusta en el cliente).
- Botón de toggle (ícono `ChevronLeft`/`ChevronRight` de `lucide-react`), visible sólo en desktop (`hidden lg:flex`), ubicado junto al wordmark en la parte superior. Al hacer click, invierte `collapsed` y lo persiste con `localStorage.setItem(...)`.
- Ancho del `<aside>`: cuando `collapsed` es `true`, `lg:w-[76px]` en vez de `lg:w-72`; agregar `transition-[width] duration-200` para que el cambio sea animado.
- Con `collapsed = true`:
  - Ocultar el texto de cada módulo (`module.label`) y el badge "Pronto" — dejar sólo el ícono centrado. Agregar `title={module.label}` al link/div para que quede como tooltip nativo al hover.
  - Ocultar el submenú de hijos (`module.children`) aunque el módulo esté activo — no tiene sentido una lista de texto en una franja de íconos.
  - En el bloque inferior: ocultar el texto "Configuración" y "Salir" (dejar sólo íconos con `title`), y ocultar el email.
  - Ocultar el wordmark "Awareness AI" completo o dejar sólo una marca corta (a definir en implementación, algo simple tipo la "A" o el ícono de marca).

No hace falta tocar `app/(app)/layout.tsx`: `<main className="min-w-0 flex-1">` ya se reacomoda solo al ancho que le deje el sidebar.

---

## Verificación

Cada uno de los tres ítems (Bug A, Bug B, Feature) se cierra con checklist manual confirmado uno por uno en la app real corriendo (`npm run dev`), por CLAUDE.md §13:

- **Bug A:** abrir `/leads` (dashboard largo), scrollear la página hasta el final y confirmar que la barra lateral completa (logo, módulos, Configuración/Salir/email) se mantiene visible y anclada, sin cortes ni espacios vacíos.
- **Bug B:** confirmar que los títulos de tarjeta y los `<select>` (Fuente, Rubro en `/leads/generar`) se leen con buen contraste al abrir el desplegable.
- **Feature:** confirmar que el botón colapsa/expande la barra, que el estado persiste al recargar la página, y que con la barra colapsada se puede seguir navegando por ícono (incluyendo módulos deshabilitados mostrando "Pronto" al hover).
