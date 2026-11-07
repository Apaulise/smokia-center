# Modo claro y piloto de UI en Marca Personal

Transversal (sin número de fase). Código escrito el 2026-11-07; checklist manual pendiente.

## Qué es
1. **Modo claro** para toda la app, con los tokens claros del Design System "Señal y humo". El oscuro sigue siendo el default.
2. **Piloto de UI** en Marca → Resumen (`/marca`), tomando de una referencia externa sólo lo que cabe en el sistema: rayado como textura de serie secundaria, gráfico de unidades (waffle), números que suben, eyebrow con punto, esqueleto con la forma real y entrada escalonada. **Se descartó** lo que el sistema prohíbe: degradé en cifras, glow, colores nuevos.

## Cómo
- `globals.css`: `:root[data-theme="light"]` redefine los `--color-lm-*`; tokens viejos (`cyan`, `base`…) pasan a ser alias de `lm-`; `body` usa `lm-`; variantes claras de popover, hub y backdrop.
- `components/shell/theme-toggle.tsx` + script inline en `app/layout.tsx` (sin parpadeo). Interruptor en la sidebar (segmentado / ícono si está colapsada) y en el hub.
- Hex sueltos reemplazados por tokens en leads y marca (dialogs, gráficos, checkboxes, agenda).
- Marca: `CountUp`, `Waffle`, `.lm-hatch`, `.lm-rise`, `loading.tsx`, área rayada en "Alcance".

## Fuera de alcance (a propósito)
- Resto de los gestores con efectos nuevos: se extiende cuando el piloto esté aprobado.
- Pantallas con componentes viejos (`components/ui/*`, `coming-soon`): sólo cambian por los alias de tokens.
- Saludo contextual con chips y campo "Preguntale al copiloto" en el Resumen.

---

## Fase 2 — Navegación fluida (2026-11-07)

Pedido: "no noto ningún cambio"; que navegar entre pestañas se sienta fluido y profesional. Se revisó [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) y **no se instaló**: es un catálogo de estilos (glassmorphism, neumorfismo…) más un script de Python, y esos estilos chocan con las reglas de "Señal y humo". Se tomaron sólo sus principios de movimiento (feedback inmediato, tiempos asimétricos de 100–250ms, interacciones cancelables, `prefers-reduced-motion`).

Qué se hizo:

- **Respuesta inmediata al clic**: `components/shell/navigation-state.ts` guarda "a dónde estoy yendo"; la sidebar marca el ítem activo en el mismo fotograma, sin esperar a que cargue la pantalla.
- **Indicador deslizante** en los subítems (`ChildNav` en `sidebar.tsx`): un fondo `raised` con marca amarilla que se mueve de pestaña a pestaña (transform, 200ms).
- **Barra de progreso** de 2px en `signal` (`navigation-progress.tsx`, montada en el layout raíz): detecta cualquier clic en un link interno.
- **Transición de pantalla** con `<ViewTransition>` de React vía `template.tsx` (en `(app)`, `leads`, `marca`, `operaciones`): sale en 110ms, entra en 200ms con 8px de subida. Los templates evitan remontar `BrandAutoSync` y `OpsLiveRefresh`, que viven en los layouts.
- **Caché del router** `staleTimes.dynamic = 30` (`next.config.ts`): volver a una pestaña visitada hace <30s es instantáneo. Costo: lo que cambia desde afuera (webhooks, agentes) puede tardar hasta 30s en verse al cambiar de pestaña. Revertir: `dynamic: 0`.
- Botones se hunden 1px al apretar; el esqueleto genérico `(app)/loading.tsx` ahora usa `lm-smoke` y se desvanece al llegar el contenido.

Nota: en `next dev` no hay prefetch (sólo corre en producción) y cada ruta se compila a demanda, así que la velocidad real de las pestañas sólo se juzga con un build de producción servido con `npm start`, o en Vercel.

> **Estado (2026-11-07): código escrito; typecheck, eslint y build:verify pasan; no se vio en pantalla (requiere sesión). Checklist manual pendiente.**

## Fase 3 — Capa líquida (2026-11-07)

El dueño pidió sumar efecto liquid y degradado aunque contradiga CLAUDE.md §6; §6 se actualizó para reflejarlo. Qué se hizo: `.lm-ambient` (manchas de luz que derivan despacio, en `(app)/layout.tsx`), `.lm-glass` en sidebar y barra mobile, `.lm-glass-soft` en `Card` de Marca y `Panel` de Leads, `.lm-glass-pop` en diálogo y ⌘K (con scrim desenfocado), `.lm-btn-liquid` en los dos botones primarios (el de Marca seguía en cian→azul con glow y se migró) y degradado en la barra de progreso. Los wrappers de módulo ya no pintan `bg-lm-bg` para que el fondo se vea detrás del vidrio. `backdrop-filter` tiene fallback opaco y todo respeta `prefers-reduced-motion`.

> **Estado (2026-11-07): código escrito; checklist manual pendiente. Riesgo conocido: backdrop-filter en muchas tarjetas puede costar rendimiento en equipos modestos.**

**Extensión a las demás secciones (2026-11-07):** `.lm-glass-soft` en las tarjetas grandes sueltas (hub, filtros y composer de Leads, agenda, calendario, competencia) y `.lm-tint` —mismo relleno y brillo, sin `backdrop-filter`— en lo que se repite (columnas del kanban, tarjetas de lista, reels, outliers, notas de conocimiento, análisis). Operaciones, Configuración, Facturación y Panel ya heredaban el vidrio por `Panel`/`Card` y el `.lm-ambient` del layout. Checklist manual sigue pendiente.
