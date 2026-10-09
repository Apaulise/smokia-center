---
name: agregar-fuente-de-leads
description: Receta para sumar una nueva fuente de leads (provider) a SmokIA — LeadSourceProvider, registry, enum lead_source y tipos. Usar al agregar o modificar una fuente de leads.
---

# Receta: agregar una fuente de leads

1. Crear `lib/providers/<fuente>.ts` implementando `LeadSourceProvider`:
   - `criteriaSchema` (Zod) — **el formulario de `/leads/generar` se renderiza solo desde acá**
   - `buildInput(criteria)` — criterios → input del actor de Apify
   - `mapItem(item)` — item del dataset → `NormalizedLead`. Devolver `null` descarta el item
   - `estimateCost(criteria)`
2. Registrarlo en `lib/providers/registry.ts`
3. Agregar el valor al enum `lead_source` con una migración
4. `npm run db:types`

**No hace falta tocar la UI.** Si estás editando una pantalla para sumar una fuente, la abstracción se rompió.
