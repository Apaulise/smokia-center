import type { Json } from "@/lib/supabase/database.types";

/**
 * Datos del embudo de Instagram (ManyChat) guardados en `leads.intake`, para
 * mostrarlos en la ficha. `intake` llega con la migración 20261105120000: hasta
 * regenerar `database.types.ts` (`npm run db:types`) se lee del lead con un cast.
 */
export type InstagramIntakeView = {
  username: string | null;
  stage: string | null;
  rubro: string | null;
  tarea: string | null;
  tamano: string | null;
  volumen: string | null;
  keyword: string | null;
  piezaOrigen: string | null;
};

const STAGE_LABEL: Record<string, string> = { respondio: "Respondió", tibio: "Tibio", calificado: "Calificado" };

function str(value: Json | undefined): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** El valor del select y, si eligió "otro", lo que escribió: `salud · veterinaria`. */
function withFree(option: Json | undefined, free: Json | undefined): string | null {
  const parts = [str(option), str(free)].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** `null` si el lead no entró por el embudo de Instagram. */
export function readInstagramIntake(lead: object): InstagramIntakeView | null {
  const raw = (lead as { intake?: Json | null }).intake;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const stage = str(raw.stage);
  return {
    username: str(raw.ig_username),
    stage: stage ? (STAGE_LABEL[stage] ?? stage) : null,
    rubro: withFree(raw.rubro, raw.rubro_libre),
    tarea: withFree(raw.tarea, raw.tarea_libre),
    tamano: str(raw.tamano),
    volumen: str(raw.volumen),
    keyword: str(raw.keyword),
    piezaOrigen: str(raw.pieza_origen),
  };
}
