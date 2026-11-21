# components/ui — el kit único

Todo componente visual reutilizable vive acá, sea del gestor que sea. Antes había
tres kits (`components/ui` viejo, `components/leads/ui` y `components/brand/ui`);
se unificaron el 2026-11-17. Lo que es de una sola pantalla va junto a esa
pantalla (`components/leads/…`, `components/brand/…`), no acá.

| Archivo | Qué trae |
|---|---|
| `button.tsx` | `Button`, `ButtonLink`, `ButtonExternalLink`, `IconButton`, `Kbd` |
| `field.tsx` | `Field`, `Input`, `Select`, `Textarea` |
| `dialog.tsx` | `Dialog` (foco atrapado, Esc, portal) |
| `confirm.tsx` | `useConfirm()`: la confirmación de la app, en vez de `window.confirm` |
| `tabs.tsx` | `Segmented` (modos de vista) y `Tabs` (dock de pastillas) |
| `page-header.tsx` | `HeaderBar` y `PageHeading` |
| `section.tsx` | `Section` y `Panel` |
| `card.tsx` | `Card`, `Eyebrow`, `Meter`, `KpiStrip`, `Tag`, `Crumbs`, `EmptyValue` |
| `kpi-row.tsx` | `KpiRow`, `Kpi` |
| `table.tsx` | `Table`, `Th`, `Td`, `Tr`, `MiniBar`, `RowMenuTrigger` |
| `feedback.tsx` | `EmptyLine`, `EmptyState`, `Toast` |
| `status-badge.tsx` | `StatusBadge`, `Chip` |
| `error-screen.tsx` | La pantalla de error y de 404 |
| `pipeline.tsx`, `timeline.tsx`, `composer.tsx`, `copilot.tsx` | Piezas del copiloto comercial |
| `count-up.tsx`, `waffle.tsx` | Número animado y gráfico de unidades |
| `otp-input.tsx` | Código de 6 dígitos (recuperar contraseña) |

Reglas: sólo tokens `lm-` (CLAUDE.md §6), un primario amarillo por vista, y una
clase propia que se use con variante se declara con `@utility` en `globals.css`.
