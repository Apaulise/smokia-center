import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // El Sistema Operativo de Contenido (Plans/03 §3.10) se lee del disco en
  // runtime (lib/brand/ai/content-os.ts) — ningún `import` lo ata al bundle,
  // así que el trace de salida no lo incluye solo y en producción el
  // readFileSync tiraría ENOENT sin esta declaración.
  outputFileTracingIncludes: { "/*": ["Awareness_AI_Sistema_de_Contenido.md"] },
};

export default nextConfig;
