import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los dos prompts canónicos —el Sistema Operativo de Contenido (Plans/03
  // §3.10) y el Sistema de Prospección (Plans/01 §1.7)— se leen del disco en
  // runtime (lib/brand/ai/content-os.ts, lib/leads/ai/sales-os.ts). Ningún
  // `import` los ata al bundle, así que el trace de salida no los incluye
  // solo y en producción el readFileSync tiraría ENOENT sin esta declaración.
  outputFileTracingIncludes: {
    "/*": ["Awareness_AI_Sistema_de_Contenido.md", "Awareness_AI_Sistema_de_Prospeccion.md"],
  },
};

export default nextConfig;
