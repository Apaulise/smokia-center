# Notas de sesiones — 2026-09-30

Bloc de seguimiento para retomar en otra PC después de `git pull`. **Claude: leer este archivo completo al empezar y retomar desde "Pendientes".** Una vez cerrados los pendientes, borrar o archivar este archivo.

Reglas vigentes (ver CLAUDE.md §13 y memoria): los checklists manuales se hacen **de a un ítem por mensaje**, esperando ok/falla. No avanzar de `§x` con ítems pendientes.

---

## Sesiones del día (cronológico)

### 1. Migración de Windsor a la API oficial de Meta (madrugada, ~02:06)
- Se migró la sincronización de Instagram de Windsor a la API oficial de Meta (credenciales `Instagram Access Token` e `Instagram User ID` en `.env.local`).
- Sync funciona y es rápida. El usuario notó que las views son algo menores que las de Instagram (162 vs ~187 en el último reel): diferencia de medición, no bug confirmado.
- Quedó verificado en la app real todo lo que se puede leer de la cuenta. **Pendiente: publicar de verdad por API** (ítem 7 del checklist, un POST de prueba).
- El proveedor de Instagram ya sabe publicar carruseles por API oficial.
- Idea futura (no empezar, regla de fases): creador de carruseles autogestionado (generar contenido, programar, flujo de aprobación). Antes hay que probar un carrusel real. Registrado en `Plans/03` y en memoria.

### 2. Rediseño de Configuración (~02:35–10:45)
- Rediseño de la pantalla `/configuracion` completo y con typecheck limpio.
- Errores de hidratación y `.find()` sobre undefined eran **bundle viejo** (`.next` obsoleto), no bugs reales. Confirmado en incógnito.
- `JWT issued at future`: desfase del reloj local, se recuperó solo; sólo actuar si se repite.
- Corregido el aspect ratio de `logo-mark.png` (230×400) en `components/shell/sidebar.tsx`.

### 3. Mejora de la respuesta sugerida / análisis (~11:38–12:53)
- Bug: la respuesta sugerida saludaba al lead con el nombre del vendedor ("Gracias por la respuesta, Agustín"), porque el lead mencionaba a Agustín en su mensaje.
- Fix de prompt en `SmokIA_Sistema_de_Prospeccion.md`: §18 (nunca abrir con nombre propio salvo decisor confirmado por el enriquecimiento) y §19 (un nombre en el mensaje del lead casi siempre es el del vendedor). Aplica a los cuatro llamados porque `sales-os.ts` manda el archivo entero como `system`.
- El usuario pidió una opción de **volver atrás** si se aprieta "Analizar otra respuesta" sin querer (estado donde le toca registrar su respuesta). Después dijo que ya corrigió a mano y no hizo falta; sin pendiente.

### 4. §1.22 — Cadena de ejecución (~11:27–12:39)
- Objetivo mensual → contactos por día, con tasas que se ajustan solas. Reabre §1.6 con ticket manual. Pantalla `/leads/objetivo` y tile "Hoy" en el dashboard `/leads`.
- Bug de hidratación del sidebar ("Objetivos" parpadeaba y desaparecía): otra vez `.next` viejo. Se discutió cómo evitar que se repita (ver CLAUDE.md §11: usar `npm run build:verify`, nunca `npm run build` con el dev server abierto).
- **Checklist manual de §1.22: 10 ítems, quedó en el ítem 1 sin responder.** Ítem 1: en `/leads/objetivo` sin objetivo definido debe verse el estado vacío con botón "Definir objetivo", y en `/leads` el primer tile dice "Hoy —" con link "Definir objetivo".

### 5. §1.20 y §1.21 (sesión larga, arrancó el 28/9, cerró hoy)
- **§1.20 Centro de seguimiento** (`/leads/seguimiento`): reutiliza la detección de §1.14/§1.16. Cerrado y verificado.
- **§1.21 Alta manual de un lead** (`/leads/lista`: "Agregar lead" y "Nueva lista"): lista obligatoria, `source: 'MANUAL'`. Cerrado y verificado.
- Bugs corregidos: nota sin loguear al cargar un lead a mano; el cuadro de "Notas" de la ficha pasó de "nota actual" precargada a registro que se vacía tras guardar (**cambia el comportamiento en todas las fichas**).

### 6. Bugs de "Analizar respuesta" (~12:53–14:18)
- Respuesta sugerida sin sentido: el panel decía bien "Próxima acción: Pedir la reunión" pero el mensaje era otra pregunta de descubrimiento. Causa: el respaldo especializado (`ACTION_INSTRUCTION` en `reply.ts`) sólo corría si la primera llamada venía vacía. Fix en `lib/leads/ai/actions.ts`: el respaldo corre siempre que la acción no sea `ASK_QUESTION`.
  - **A verificar:** reabrir ese lead, "Analizar otra respuesta" con el mismo texto, confirmar que sale un pedido de reunión.
- Crash en otro lead: análisis viejos guardados sin `web_presence` rompían `enrich-panel.tsx` y `lib/leads/ai/prompts.ts:52`. Se agregó fallback a `SIN_VERIFICAR` en ambos. No hace falta migrar datos; para tener presencia web real hay que re-enriquecer esos leads.

### 7. Consulta: estado de la Migración fuera de Anthropic (~12:43)
- Etapa 1 implementada de punta a punta (código y build): 7 llamados a Groq (`openai/gpt-oss-120b`: analyze, opening, follow-up, recommendations, rewrite) y Gemini (script, outlier-idea).
- **Checklist manual de 7 pasos pendiente**: 1 probar conexión Groq, 2 `rewriteMessage`, 3 `generateFollowup`, 4 `generateOpening`, y el resto según `Plans/migracion-fuera-de-anthropic.md`.
- Problemas conocidos: Gemini da 429 al enriquecer porque se agotaron los créditos prepagados (cargar saldo en AI Studio → Facturación, sin cambio de código); confirmar que `openai/gpt-oss-120b` sigue vigente en `console.groq.com/docs/models` (una constante, `GROQ_MODEL`).
- Etapa 2 (chat de Marca en `lib/brand/ai/chat.ts`, sigue en Anthropic): sin planificar.

---

### 8. Sesiones de preparación de pendientes y avance de Marca (tarde)
- Se prepararon (solo lectura) los checklists de los cinco pendientes; siguen sin correrse los de §1.22, "Pedir la reunión", Etapa 1 y §1.7–§1.19.
- **§3.13 ítem 10: ok.** **Ítem 8: pendiente** (pide publicar un reel real a mano).
- **§3.15:** `#ai` con 10 resultados no trajo tarjetas (esperado: el piso es 150.000 views y el actor trae el feed reciente). Descartar/restaurar: ok. "Usar": sin probar. Se agregó un mensaje de resultado en `/marca/competencia` ("N reels revisados, M virales"), sin verificar visualmente.
- **Publicación por API (ítem 7 de la migración):** `PUBLISH_FROM_APP_ENABLED` quedó en `true` en `lib/brand/planner/schema.ts:68` para probar con una historia. **Volver a `false` al terminar la prueba.** Verificación en Instagram todavía sin hacer.

## Pendientes para retomar (en este orden sugerido)

1. **Checklist manual §1.22** (objetivo → contactos por día): retomar desde el ítem 1 de 10, de a uno.
2. **Verificar el fix de "Pedir la reunión"** en el lead afectado (ver sesión 6).
3. **Checklist manual de la Etapa 1 fuera de Anthropic** (7 pasos) + cargar saldo de Gemini + confirmar modelo de Groq.
4. **Checklists manuales de §1.7–§1.19** (copiloto comercial): ninguno probado en la app real todavía.
5. **Marca:** publicar de verdad por API de Meta con una historia de prueba (ítem 7 de la migración; flag en `true`, volver a `false` después); ítem 8 de §3.13 (el 10 ya está ok); §3.15 pendiente el "Usar" y confirmar el mensaje nuevo; §3.7 sin verificar.

## Recordatorios al cambiar de PC
- `.env.local` **no está en git**: copiarlo a mano (incluye `APP_ENCRYPTION_KEY`, que no se puede regenerar sin perder datos cifrados, y las credenciales de Instagram).
- Después del pull: `npm install`, y si algo de hidratación falla, borrar `.next`.
- La DB es la nube (Supabase), no hay que migrar nada; si hay migraciones nuevas, mirar `npm run db:diff` antes de `db:push`.
