---
name: agregar-prompt-literal
description: Receta para sumar o modificar un prompt canónico de Awareness AI que se lee del disco en runtime (como Sistema_de_Contenido y Sistema_de_Prospeccion) — el loader, la declaración en outputFileTracingIncludes de next.config.ts y las trampas de producción. Usar al agregar un tercer prompt-archivo o al editar uno de los existentes.
---

# Receta: prompt literal leído del disco

Contexto en `CLAUDE.md` §6. Hoy hay dos: `Awareness_AI_Sistema_de_Contenido.md` (marca, `lib/brand/ai/content-os.ts`) y `Awareness_AI_Sistema_de_Prospeccion.md` (leads, `lib/leads/ai/sales-os.ts`). En los dos **el archivo es el prompt**: se manda al modelo tal cual, sin transcribirlo a una constante de TypeScript.

## Agregar un prompt nuevo

1. **Archivo `.md` en la raíz del repo**, con nombre `Awareness_AI_<Sistema>.md`, junto a los otros dos. Todo lo que contenga se le manda al modelo en cada mensaje: nada de notas para humanos adentro, ni borradores, ni comentarios de autor.
2. **Loader** en `lib/<modulo>/ai/<nombre>.ts`, copiando el patrón de `content-os.ts` / `sales-os.ts`:
   ```ts
   import { readFileSync } from "node:fs";
   import path from "node:path";

   let cached: string | null = null;

   export function getXxxOS(): string {
     if (cached === null) {
       cached = readFileSync(path.join(process.cwd(), "Awareness_AI_Xxx.md"), "utf-8");
     }
     return cached;
   }
   ```
   Se lee una vez por proceso y se cachea a nivel módulo. Solo en código de servidor.
3. **Declararlo en `next.config.ts`**, en `outputFileTracingIncludes["/*"]`, sumándolo al array y **actualizando el comentario** que enumera los prompts. **Este es el paso que se olvida.** Ningún `import` ata el `.md` al bundle, así que sin esta línea todo anda en `next dev` y en `build:verify`, y en producción el `readFileSync` tira `ENOENT`. Es un error que solo aparece desplegado.
4. **Documentarlo**: sumar el archivo a `CLAUDE.md` §6 (los prompts literales) con el módulo y el plan al que pertenece.

## Verificación

- `npm run typecheck` y `npm run build:verify` pasan, **pero no prueban lo importante**: el `ENOENT` no se reproduce ahí. Hay que comprobar a mano que el nombre del archivo es idéntico en tres lugares: el `.md` en disco, el `path.join` del loader y el array de `next.config.ts` (mayúsculas, guiones bajos, sin tilde).
- Verificar el trace tras el build: el archivo debería aparecer en el `.nft.json` de la ruta (`.next-verify/server/app/.../*.nft.json`, buscar el nombre del `.md`).
- `grep` de los nombres de archivo en `*.ts` para confirmar que cada prompt-archivo tiene su loader y su entrada en `next.config.ts`; si uno de los tres falta, está roto en producción.

## Editar un prompt existente

- El contenido va al modelo literal en cada mensaje: cada línea agregada se paga en tokens, en cada llamado. Preferir reemplazar o condensar antes que acumular.
- El loader cachea por proceso: tras editar el `.md`, **reiniciar `next dev`**, o el cambio no se ve y parece que "no hizo nada".
- No se mezclan criterios entre prompts: el de Contenido es la voz de la marca personal, el de Prospección es el copiloto comercial, y `Awareness_AI_Manual_de_Marca.md` es identidad visual y no se carga como prompt. No sirve para deducir una voz de escritura.
- Un cambio de comportamiento del modelo por editar el prompt se prueba en la app (cuesta una llamada a Groq/Gemini); avisar al usuario antes de pedir esa prueba.
