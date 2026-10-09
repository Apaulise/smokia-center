import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // `next dev` y `next build` comparten `.next` por defecto — correr un build
  // de producción mientras el dev server está vivo lo deja en un estado mixto
  // (CLAUDE.md §11). `npm run build`/`start` (lo que corre el usuario o
  // Vercel) sigue usando `.next`, sin cambios; `npm run build:verify` (lo que
  // corre Claude Code para chequear que compila) fija esta variable y compila
  // aparte en `.next-verify`, así nunca pisa la carpeta del dev server.
  distDir: process.env.NEXT_BUILD_DIST_DIR || ".next",
  // Los dos prompts canónicos —el Sistema Operativo de Contenido (Plans/03
  // §3.10) y el Sistema de Prospección (Plans/01 §1.7)— se leen del disco en
  // runtime (lib/brand/ai/content-os.ts, lib/leads/ai/sales-os.ts). Ningún
  // `import` los ata al bundle, así que el trace de salida no los incluye
  // solo y en producción el readFileSync tiraría ENOENT sin esta declaración.
  outputFileTracingIncludes: {
    "/*": ["SmokIA_Sistema_de_Contenido.md", "SmokIA_Sistema_de_Prospeccion.md"],
  },
};

export default nextConfig;
