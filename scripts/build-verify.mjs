// Build de verificación que Claude Code corre para chequear que el código
// compila, sin pisar la carpeta `.next` del `next dev` que el usuario puede
// tener abierto en paralelo (CLAUDE.md §11). Compila aparte en
// `.next-verify` vía `NEXT_BUILD_DIST_DIR` (ver next.config.ts). Wrapper en
// Node, no en el script de package.json, porque fijar una env var inline es
// sintaxis distinta en bash y en PowerShell — esto corre igual en los dos.
import { spawnSync } from "node:child_process";

const result = spawnSync("npx", ["next", "build"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, NEXT_BUILD_DIST_DIR: ".next-verify" },
});

process.exit(result.status ?? 1);
