// El runner de node no conoce el alias `@/` de tsconfig. Lo registra el
// script de tests antes de importar módulos de la app.
import { register } from "node:module";

register("./alias-hooks.mjs", import.meta.url);
