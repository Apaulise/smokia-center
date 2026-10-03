import type { LeadSource } from "@/lib/providers/types";

/** Clave en `settings` para el token de Apify. Compartida por queries y actions. */
export const APIFY_KEY_SETTING = "apify_api_key";

/** Clave en `settings` para la API key de Anthropic (Plans/03 §3.1, usada por §3.5/§3.6). */
export const ANTHROPIC_KEY_SETTING = "anthropic_api_key";

/**
 * Clave en `settings` para la API key de Google AI Studio (Gemini), Plans/03
 * §3.14. Es el modelo barato del módulo: clasifica qué publicación ajena sirve
 * para la marca, una tarea que no justifica pagar un modelo grande.
 */
export const GEMINI_KEY_SETTING = "gemini_api_key";

/**
 * Clave en `settings` para la API key de Groq (Plans/migracion-fuera-de-anthropic.md,
 * Etapa 1). Es el modelo gratuito de mayor criterio del reparto: reemplaza a
 * Claude Opus en lo que antes decidía qué escribirle a un lead o qué
 * recomendar sobre un período de contenido.
 */
export const GROQ_KEY_SETTING = "groq_api_key";

/**
 * Perfil del vendedor (Plan §1.7). No es una key: es el texto que le dice al
 * copiloto qué experiencia y qué casos reales puede afirmar. Vive acá y no
 * dentro del Sistema de Prospección porque cambia —un caso hoy, tres en tres
 * meses— y el prompt canónico va cacheado byte a byte: moverlo invalidaría el
 * caché en cada edición. Se inyecta en el bloque de estado del turno.
 *
 * Se guarda cifrado como todo lo demás de `settings`, no porque sea secreto
 * sino porque la columna se llama `value_encrypted` y meterle texto plano
 * sería mentirle al próximo que la lea.
 */
export const SALES_PROFILE_SETTING = "sales_profile";

/**
 * Clave en `settings` para el actor de Apify configurado por el usuario para
 * una fuente puntual. Sobreescribe el `defaultActorId` del proveedor
 * (lib/providers/*) — necesario en LinkedIn, donde no hay un actor por default.
 */
export function actorOverrideKey(source: LeadSource): string {
  return `apify_actor_${source}`;
}

/**
 * Rubros comunes para sembrar el catálogo de un usuario nuevo. Colores
 * alternan cyan/violeta (manual §9) para que la lista no salga monocroma.
 */
export const DEFAULT_INDUSTRIES: Array<{ name: string; color: string }> = [
  { name: "Gastronomía", color: "#18D6E8" },
  { name: "Salud y belleza", color: "#7C3AED" },
  { name: "Retail", color: "#18D6E8" },
  { name: "Construcción y reformas", color: "#7C3AED" },
  { name: "Profesionales y servicios", color: "#18D6E8" },
  { name: "Inmobiliarias", color: "#7C3AED" },
  { name: "Educación", color: "#18D6E8" },
  { name: "Fitness y deporte", color: "#7C3AED" },
  { name: "Automotriz", color: "#18D6E8" },
  { name: "Turismo y hotelería", color: "#7C3AED" },
];

/**
 * Credenciales de Instagram (Graph API de Meta) de cada usuario: JSON
 * `{accessToken, userId}` cifrado. Antes vivían en variables de entorno, pero
 * cada socio conecta su propia cuenta (Plans/acceso-multiusuario.md).
 */
export const INSTAGRAM_CREDENTIALS_SETTING = "instagram_credentials";
