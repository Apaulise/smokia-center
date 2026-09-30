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

/**
 * Sólo las secciones pedidas (`## N.`), literales y en orden, más el título.
 * Para llamados que corren contra un tope de tokens/minuto chico (Groq free:
 * 8000) donde mandar los 31 capítulos no entra. Nunca reescribe texto: recorta.
 */
export function getContentOSSections(numbers: number[]): string {
  const wanted = new Set(numbers);
  const kept: string[] = [];
  let keep = true; // el título y lo previo a la sección 1 se conservan
  for (const line of getContentOS().split("\n")) {
    const match = /^## (\d+)\./.exec(line);
    if (match) keep = wanted.has(Number(match[1]));
    if (keep) kept.push(line);
  }
  return kept.join("\n");
}
