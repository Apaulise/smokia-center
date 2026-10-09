---
name: checklist-manual
description: Genera y conduce el checklist de pruebas manuales de un paso §x de un plan de SmokIA (CLAUDE.md §13) — ítems puntuales, confirmación ítem por ítem, ítems que gastan tokens al final como opcionales, y cierre del paso con estado actualizado. Usar al terminar de implementar un §x, o al retomar uno con checklist pendiente.
---

# Checklist manual de un paso del plan

Regla de fondo: `CLAUDE.md` §13. Un `§x` no se cierra porque compile o pase `build:verify`; se cierra cuando el usuario probó la app real y confirmó **cada ítem**. Los bugs que valieron esta regla (un conteo mal calculado, un botón de refresco que no reflejaba el resultado) no los vio ningún typecheck.

No aplica a fixes puntuales ni ajustes pedidos sobre la marcha fuera de un `§x`.

## 1. Armar el checklist

1. Leer el `§x` en `Plans/` y el diff real de lo implementado (`git log`/`git diff` del paso). Los ítems salen de **lo que se construyó**, no de lo que el plan prometía: si algo del plan quedó diferido, no va.
2. Si el paso tiene un checklist previo o un estado de "pendiente en los ítems N y M" (en el plan o en `CLAUDE.md` §1), retomar ese: no regenerar desde cero ni renumerar.
3. Cada ítem tiene tres partes, y las tres son obligatorias:
   - **Dónde**: ruta o pantalla exacta (`/leads/...`, `/marca/...`)
   - **Qué hacer**: pasos concretos, con datos de ejemplo si hacen falta
   - **Qué se espera**: el resultado observable. "Funciona" no es un resultado
4. Cubrir, según corresponda al paso:
   - el camino feliz
   - un caso borde o vacío (lista sin leads, sin datos, sin credenciales)
   - **aislamiento entre usuarios**, si hay tablas o consultas nuevas: con la cuenta del socio no se ven los datos del dueño
   - persistencia: recargar la página y que el dato siga ahí
   - estados de error visibles en español (no un stack ni una pantalla en blanco)
5. Orden: de lo más barato y fundamental a lo más caro. Lo que dispara una corrida de Apify cuesta plata real (usar `maxResults` chico, 5); lo que llama al modelo gasta cuota.

### Ítems que gastan tokens o plata

El usuario prefiere no gastar cuota del modelo en verificaciones y suele diferir esos ítems. Entonces:

- Agruparlos **al final**, bajo un encabezado "Opcionales (gastan ...)"
- Anotar el costo de cada uno (llamado a Groq/Gemini, corrida de Apify con N resultados)
- Dejar todo lo demás verificable **sin** llamar a un servicio externo pago
- Gemini hoy puede estar sin saldo (429): si un ítem depende de eso, decirlo antes de pedir la prueba

## 2. Conducir la verificación

- Presentar los ítems **numerados**, pero pedir la confirmación **de a uno** (o de a pocos contiguos si son triviales). Nunca "¿está todo ok?" en bloque
- Respuestas posibles por ítem: **ok**, **falla** (con lo que se vio) o **diferido**
- **Falla**: reproducir, arreglar, `npm run typecheck` y `npm run build:verify`, y volver a pedir la confirmación **de ese ítem**. No seguir al `§x` siguiente con ítems fallando
- **Diferido**: el usuario puede decidirlo; se anota como **pendiente**, nunca como probado, y se sigue solo si él lo pide
- Nunca correr `npm run build` para verificar (comparte `.next` con el dev server del usuario): `build:verify`

## 3. Cerrar el paso

Solo con todos los ítems en ok (los diferidos quedan declarados como pendientes, y el paso **no** se cierra del todo):

1. En el `§x` del plan, reemplazar la línea de estado por la fecha y el resultado: `> **Estado (AAAA-MM-DD): cerrado, checklist manual completo.**` — o, si hay diferidos, `implementado; checklist hecho salvo los ítems N y M (motivo)`
2. Actualizar la fila del módulo en `CLAUDE.md` §1 con el mismo estado (hoy lleva "checklist manual pendiente" por paso; mantener ese lenguaje)
3. Si el estado cambió respecto de lo que dice la memoria (`MEMORY.md`), actualizar esa entrada en vez de crear una nueva
4. Recién ahora se puede arrancar el `§x` siguiente

## Formato de salida

```
### §x.y — <nombre del paso> · checklist manual

Antes de empezar: <cuenta a usar, datos de prueba, si hace falta `npm run dev`>

1. **<Pantalla>** — <qué hacer>
   Esperado: <resultado observable>
2. ...

Opcionales (gastan tokens / plata):
N. **<Pantalla>** — <qué hacer> · costo: <llamado a Gemini | corrida de Apify, 5 resultados>
   Esperado: ...

Empezamos por el 1: decime ok, falla o diferido.
```
