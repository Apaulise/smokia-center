/**
 * Avatares del perfil. Dos orígenes: la biblioteca pública DiceBear (sólo
 * estilos con licencia CC0, sin atribución obligatoria) o una foto propia
 * subida al bucket `avatars`. Este archivo lo usan el cliente (selector) y el
 * servidor (validación), así que no importa nada de ninguno de los dos.
 */
export const AVATAR_BUCKET = "avatars";

export const DICEBEAR_STYLES = [
  { id: "lorelei", label: "Retratos" },
  { id: "notionists", label: "Bocetos" },
  { id: "thumbs", label: "Caritas" },
  { id: "bottts-neutral", label: "Robots" },
  { id: "shapes", label: "Formas" },
  { id: "identicon", label: "Patrones" },
] as const;

export type DicebearStyle = (typeof DICEBEAR_STYLES)[number]["id"];

const DICEBEAR_HOST = "https://api.dicebear.com/9.x";
const MAX_SEED_LENGTH = 40;

export function dicebearUrl(style: DicebearStyle, seed: string) {
  return `${DICEBEAR_HOST}/${style}/svg?seed=${encodeURIComponent(seed.slice(0, MAX_SEED_LENGTH))}`;
}

/** Devuelve la URL normalizada si es un avatar DiceBear permitido; si no, null. */
export function parseDicebearUrl(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const match = /^\/9\.x\/([a-z-]+)\/svg$/.exec(url.pathname);
  const style = DICEBEAR_STYLES.find((s) => s.id === match?.[1]);
  const seed = url.searchParams.get("seed");
  if (url.origin !== "https://api.dicebear.com" || !style || !seed || seed.length > MAX_SEED_LENGTH) return null;
  return dicebearUrl(style.id, seed);
}

/** Ruta dentro del bucket de una URL pública de foto subida, o null si no lo es. */
export function uploadedAvatarPath(url: string | null | undefined, supabaseUrl: string): string | null {
  if (!url) return null;
  const prefix = `${supabaseUrl}/storage/v1/object/public/${AVATAR_BUCKET}/`;
  return url.startsWith(prefix) ? decodeURIComponent(url.slice(prefix.length)) : null;
}
