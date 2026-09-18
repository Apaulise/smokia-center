# CLAUDE.md — Awareness AI

Guía de trabajo de este repo. Leer antes de escribir código.

---

## 1. Qué es Awareness AI

Panel central del negocio de Awareness AI, una agencia de IA y automatización. El negocio tiene **tres patas**, y el panel las agrupa:

| Módulo | Qué hace | Estado |
|---|---|---|
| **Panel principal** | Agrega métricas de las tres patas | Fase 4 — placeholder |
| **Gestor de Leads** | Genera listas por rubro y zona, seguimiento hasta el cierre | **Fase 1 — en construcción** |
| **Gestor de Facturación** | Ingresos, clientes, cobros | Fase 2 — no empezado |
| **Gestor de Marca Personal** | Contenido y presencia | Fase 3 — en construcción |

Los planes viven en `Plans/`, numerados por fase: [01 — Gestor de Leads](Plans/01-gestor-de-leads.md) y [03 — Gestor de Marca Personal](Plans/03-gestor-de-marca-personal.md), este último escrito por adelantado y hoy **en construcción** (ver §2). El manual de identidad visual, en [Awareness_AI_Manual_de_Marca.md](Awareness_AI_Manual_de_Marca.md).

---

## 2. Regla de fases (la más importante)

**Un gestor por vez. No se arranca el siguiente hasta que el anterior esté desplegado y en uso real.**

Esto no es una preferencia de estilo: es la decisión que evita terminar con tres módulos a medio hacer y ninguno usable. En concreto:

- No adelantar trabajo de fases posteriores aunque parezca barato hacerlo "de paso"
- Cuando algo de la fase actual depende de una futura, dejar un **stub con la interfaz** y diferir. Ejemplo vigente: el objetivo diario de contacto depende del Gestor de Facturación → `lib/leads/goals.ts` es un stub
- Los módulos no construidos aparecen en el sidebar **visibles pero deshabilitados**, para que la estructura del negocio se lea completa desde el día 1

**Criterio de cierre de la Fase 1:** generar una lista, trabajarla y cerrar un cliente sin salir de la app, en producción.

---

## 3. Arquitectura

Next.js 16 (App Router) + Supabase (Postgres, Auth, RLS, Realtime). **Sin ORM**: query builder de `supabase-js` sobre tipos generados del esquema real.

```
app/(auth)/login          Público
app/auth/callback         Callback de Google OAuth
app/(app)/*               Todo lo autenticado (middleware protege el grupo)
  leads/                  Dashboard, lista, ficha, generar, agenda
  configuracion/          API keys, rubros, plantillas
app/api/apify/webhook     Service role — saltea RLS (ver §4)
app/api/jobs/reconcile    Cron/fallback de importación
lib/supabase/             client (browser) · server (RSC/actions) · admin (service role) · database.types (generado)
lib/providers/            Una fuente de leads por archivo + registry
lib/apify/                Cliente HTTP y reconciliación de corridas
lib/leads/                actions · queries · dedupe · goals
supabase/migrations/      SQL versionado: tablas, RLS, funciones
components/ui/            Design system de marca
```

### Flujo de una generación de leads, de punta a punta

1. `/leads/generar` arma el formulario desde el `criteriaSchema` del proveedor elegido y muestra el costo estimado
2. Server action crea `lead_lists(PENDING)` + `scrape_jobs`, descifra el token de Apify y lanza la corrida con un webhook registrado
3. La UI se suscribe por **Realtime** a esa fila de `scrape_jobs` — el progreso aparece solo, sin polling
4. El webhook confirma el secreto, **re-consulta la corrida a Apify** (no confía en el body), pagina el dataset, mapea, deduplica y hace upsert
5. Si el webhook se pierde, `lib/apify/reconcile.ts` hace lo mismo desde el cron o al abrir la pantalla de jobs. **Es idempotente**: las tres rutas pueden pisarse sin duplicar nada

---

## 4. Reglas de datos — no negociables

Estas reglas son lo que hace que sumar una segunda persona al sistema no requiera migrar nada.

- **RLS activo en toda tabla nueva, sin excepción.** Una tabla sin política es una tabla inaccesible, y eso es el default correcto
- **Toda tabla lleva `owner_id uuid not null references auth.users(id) on delete cascade`**, con índice
- **Las políticas se escriben `(select auth.uid()) = owner_id`** — envolver en `select` habilita la optimización de initPlan de Postgres. Sin el `select`, la función se evalúa por fila
- **Índice sobre toda columna que aparezca en una política.** Sin él, cada consulta hace scan secuencial de la tabla entera
- **Todo `INSERT`/`UPDATE` lleva `WITH CHECK`**, para que nadie pueda reasignar `owner_id` a otro usuario
- **`getClaims()` en código de servidor, nunca `getSession()`.** `getSession()` no garantiza revalidar el token y no sirve para autorizar
- **La service role key sólo se usa en `app/api/apify/webhook` y en rutas de cron.** Nunca en un Server Component, nunca cerca del cliente

### La única excepción, y por qué

Un webhook no tiene sesión de usuario, así que esa ruta usa la service role key y **saltea RLS**. Por eso resuelve el `owner_id` desde la fila de `scrape_jobs` y lo escribe explícitamente en cada lead que inserta.

Es el único lugar del código donde el aislamiento depende del código y no de la base. Está aislado en un solo archivo a propósito. **Cualquier cambio ahí se revisa a mano.**

---

## 5. Convenciones de código

- **Base de datos en `snake_case`, TypeScript en `camelCase`.** Se mapea en el borde, al leer y escribir
- **Los tipos se generan, no se escriben.** `lib/supabase/database.types.ts` sale de `npm run db:types` y **no se edita a mano**. Se regenera después de cada migración
- **Mutaciones por Server Actions**, no por rutas de API. Las rutas de `app/api/` son sólo para lo que llama un tercero (webhooks, cron)
- **Zod en el borde:** todo input de formulario, y también **la salida de Apify** — un scraper devuelve lo que quiere y cambia sin avisar
- Server Components por default; `"use client"` sólo donde hay interacción real
- Nunca loguear secretos. El token de Apify no vuelve al cliente ni enmascarado sin necesidad

---

## 6. Marca

Ver [Awareness_AI_Manual_de_Marca.md](Awareness_AI_Manual_de_Marca.md). La app es **dark-only**: el manual es dark-first y no define paleta clara, así que no se inventa una.

```css
--bg:#070B17;  --bg-2:#0C1730;  --surface:#12213E;
--cyan:#18D6E8;  --cyan-soft:#72F4F1;
--violet:#7C3AED;  --purple:#4C1D95;
--text:#F4F7FF;  --text-muted:#AAB8D4;  --border:#2B416D;
--gradient-primary: linear-gradient(135deg,#18D6E8 0%,#4C7DFF 45%,#7C3AED 100%);
```

- **Tipografías:** Sora (titulares), Inter (cuerpo/UI), JetBrains Mono (números y datos)
- **Convención de color, codificada en las variantes de los componentes:** *cyan = acción y resultado*, *violeta = proceso e innovación*. No se decide pantalla por pantalla
- **Proporción:** ~70% fondo oscuro, ~20% texto, ~10% acentos. Si una pantalla se ve neón, está mal
- **Un solo efecto protagonista por vista.** Glow al 10–30% de opacidad, reservado para el foco principal
- Espaciado 8/16/24/32/48/64; radios 16–24px en contenedores

**El criterio editorial de la marca personal es otro documento y otra marca**: [Awareness_AI_Sistema_de_Contenido.md](Awareness_AI_Sistema_de_Contenido.md). Es el **system prompt literal** del agente de la Fase 3 ([Plans/03 §3.10](Plans/03-gestor-de-marca-personal.md)), no un documento sobre el prompt — todo lo que se escriba ahí se le manda al modelo en cada mensaje. El manual de arriba es identidad visual de la agencia; no sirve para deducir una voz de escritura.

---

## 7. Idioma

**Toda la UI en español**, con el vocabulario real del negocio: *rubro* (no "categoría" ni "industry"), *zona*, *facturación*, *agenda*, *lead*.

El código (variables, funciones, tablas) va en inglés. La frontera es la pantalla.

---

## 8. Comandos

```bash
npm run dev          # Next.js en desarrollo
npm run build        # Build de producción
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run db:push      # Aplica supabase/migrations/ al proyecto en la nube
npm run db:types     # Regenera database.types.ts  ← después de CADA migración
npm run db:diff      # Muestra drift entre la base y las migraciones
```

**No hay Supabase local.** Requiere Docker y la decisión fue trabajar directo contra
la nube, así que los comandos van con `--linked`, no con `--local`. El setup de una
sola vez está en [SETUP.md](SETUP.md).

Consecuencia a tener presente: **no hay base descartable**. `db:push` impacta el
proyecto real. Antes de una migración destructiva, mirar `db:diff`.

---

## 9. Receta: agregar una fuente de leads

1. Crear `lib/providers/<fuente>.ts` implementando `LeadSourceProvider`:
   - `criteriaSchema` (Zod) — **el formulario de `/leads/generar` se renderiza solo desde acá**
   - `buildInput(criteria)` — criterios → input del actor de Apify
   - `mapItem(item)` — item del dataset → `NormalizedLead`. Devolver `null` descarta el item
   - `estimateCost(criteria)`
2. Registrarlo en `lib/providers/registry.ts`
3. Agregar el valor al enum `lead_source` con una migración
4. `npm run db:types`

**No hace falta tocar la UI.** Si estás editando una pantalla para sumar una fuente, la abstracción se rompió.

---

## 10. Receta: agregar una tabla

En este orden, siempre:

1. Migración en `supabase/migrations/` con la tabla, incluyendo `owner_id`
2. `alter table ... enable row level security`
3. Las cuatro políticas (select/insert/update/delete) con `(select auth.uid()) = owner_id` y `WITH CHECK` en las de escritura
4. Índice sobre `owner_id` y sobre toda columna usada en filtros frecuentes
5. `npm run db:types`

Las políticas se aplican con `drop policy if exists` + `create policy`: `CREATE POLICY` no tiene `IF NOT EXISTS`, y sin eso la migración no se puede reejecutar. En [la migración inicial](supabase/migrations/20260911120000_init_leads.sql) esto se hace en un loop sobre la lista de tablas, para que sea imposible que una tabla quede con políticas distintas al resto — sumar el nombre de la tabla nueva a ese array es todo lo que hace falta.

---

## 11. Gotchas conocidos

- **El webhook de Apify no viene firmado.** Sólo permite un secreto en la URL. Por eso se trata el POST como una señal ("el job X puede haber terminado"), no como fuente de datos: el servidor re-consulta la corrida con nuestro propio token antes de importar
- **Apify no puede alcanzar `localhost`.** Y no es sólo que el aviso no llegue: Apify valida el `requestUrl` del webhook contra su propio servidor y **rechaza la corrida entera (400 schema-validation)** si apunta a localhost. Por eso `lib/apify/client.ts` omite el webhook por completo cuando `NEXT_PUBLIC_APP_URL` es localhost — en desarrollo la importación entra sólo por la reconciliación al abrir la pantalla. Esperado, no un bug
- **Vercel Cron en plan Hobby corre una vez por día.** Por eso el cron es un extra y no el mecanismo principal. La app funciona completa sin él
- **La ruta del proyecto tiene un espacio** (`Awareness AI`). Comillas en todo comando de shell
- **Apify cobra por resultado.** Al probar, usar `maxResults` chico (5) — cada corrida de prueba cuesta plata real

---

## 12. Notas de trabajo

- Antes de escribir **cualquier gráfico** del dashboard, cargar la skill `dataviz`. La paleta de series sale de los tokens de marca, no de los defaults de la librería
- Los planes de cada fase van en `Plans/`, numerados por fase

---

## 13. Verificación manual por paso del plan

Cada paso `§x` de un plan (`Plans/`) se cierra con una prueba manual en la app real, no sólo con que compile o pase el build.

- Al terminar de implementar un `§x`, generar un **checklist de pruebas manuales** puntual para ese paso: qué hacer y qué resultado se espera en cada ítem
- Esperar la confirmación del usuario **ítem por ítem** (ok / falla), no en bloque
- Si un ítem falla, arreglarlo y volver a pedir la confirmación de ese ítem — **no se avanza al `§x` siguiente con ítems pendientes o fallando**
- Recién con el checklist completo en ok se da el paso por cerrado y se arranca el siguiente `§x`
- Esto no aplica a fixes puntuales o ajustes pedidos sobre la marcha fuera de un `§x` — sólo a los pasos del plan

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
