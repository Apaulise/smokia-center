import { readFileSync } from "fs";
import path from "path";

/**
 * El Sistema de Prospección (Plan §1.7): el prompt canónico del copiloto
 * comercial, en `Awareness_AI_Sistema_de_Prospeccion.md`. El archivo ES el
 * prompt — se manda literal, sin transcribirlo a una constante — así que se
 * lee una vez por proceso y se cachea a nivel módulo. Mismo criterio que
 * `lib/brand/ai/content-os.ts`.
 *
 * Ver next.config.ts (`outputFileTracingIncludes`): ningún import ata el
 * archivo al bundle, y sin esa declaración el readFileSync tira ENOENT en
 * producción y sólo ahí.
 */
let cached: string | null = null;

export function getSalesOS(): string {
  if (cached === null) {
    cached = readFileSync(path.join(process.cwd(), "Awareness_AI_Sistema_de_Prospeccion.md"), "utf-8");
  }
  return cached;
}
