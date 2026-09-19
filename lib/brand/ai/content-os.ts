import { readFileSync } from "fs";
import path from "path";

/**
 * El Sistema Operativo de Contenido (Plans/03 §3.10): el prompt canónico de
 * la marca personal, en `Awareness_AI_Sistema_de_Contenido.md`. El archivo
 * ES el prompt — se manda literal, sin transcribirlo a una constante — así
 * que se lee una vez por proceso y se cachea a nivel módulo. Ver
 * next.config.ts (`outputFileTracingIncludes`) para que sobreviva al build.
 */
let cached: string | null = null;

export function getContentOS(): string {
  if (cached === null) {
    cached = readFileSync(path.join(process.cwd(), "Awareness_AI_Sistema_de_Contenido.md"), "utf-8");
  }
  return cached;
}
