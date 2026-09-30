/**
 * Restricciones de Instagram para lo que se publica (Plans/03 §3.7). Módulo
 * puro, sin imports de servidor: lo usa el navegador para rebotar un archivo
 * ANTES de subirlo (fallar una publicación con 200 MB ya subidos es la peor
 * forma de descubrir que el video duraba 16 minutos) y el servidor para
 * revalidar antes de publicar.
 *
 * Los números salen de los límites de la Content Publishing API de Meta
 * (Reels, imágenes, historias y carruseles).
 */

export type MediaType = "IMAGE" | "VIDEO";

/** Lo que se sabe de un archivo subido. Se guarda en `brand_content_items.media`. */
export interface MediaFile {
  /** Ruta dentro del bucket `brand-media`: `<owner_id>/<pieza>/<archivo>`. */
  path: string;
  type: MediaType;
  name: string;
  mime: string;
  size: number;
  width: number | null;
  height: number | null;
  durationSec: number | null;
}

/** Los tipos de pieza que se publican en Instagram desde la app. */
export const PUBLISHABLE_KINDS = ["REEL", "VIDEO", "POST", "CARRUSEL", "HISTORIA"] as const;
export type PublishableKind = (typeof PUBLISHABLE_KINDS)[number];

export function isPublishableKind(kind: string): kind is PublishableKind {
  return (PUBLISHABLE_KINDS as readonly string[]).includes(kind);
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

export const IMAGE_MAX_BYTES = 8 * MB;
export const REEL_MAX_BYTES = GB;
export const STORY_VIDEO_MAX_BYTES = 100 * MB;
export const REEL_MIN_SECONDS = 3;
export const REEL_MAX_SECONDS = 15 * 60;
export const STORY_MIN_SECONDS = 3;
export const STORY_MAX_SECONDS = 60;
export const CAROUSEL_MIN_FILES = 2;
export const CAROUSEL_MAX_FILES = 10;

/** 4:5 y 1,91:1, con un margen para el redondeo de las dimensiones en píxeles. */
const RATIO_MIN = 0.8;
const RATIO_MAX = 1.91;
const RATIO_EPSILON = 0.01;

export const ALLOWED_VIDEO_MIMES = ["video/mp4", "video/quicktime"];
export const ALLOWED_IMAGE_MIMES = ["image/jpeg"];

function formatMb(bytes: number) {
  return `${(bytes / MB).toFixed(bytes >= 10 * MB ? 0 : 1)} MB`;
}

function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return minutes > 0 ? `${minutes} min ${rest} s` : `${rest} s`;
}

function imageProblem(file: Pick<MediaFile, "mime" | "size" | "width" | "height">): string | null {
  if (!ALLOWED_IMAGE_MIMES.includes(file.mime)) {
    return "Instagram sólo acepta imágenes JPEG. Exportá el archivo como .jpg (un PNG no sirve).";
  }
  if (file.size > IMAGE_MAX_BYTES) {
    return `La imagen pesa ${formatMb(file.size)} y el máximo es ${formatMb(IMAGE_MAX_BYTES)}.`;
  }
  return null;
}

function feedRatioProblem(file: Pick<MediaFile, "width" | "height">): string | null {
  if (!file.width || !file.height) return null;
  const ratio = file.width / file.height;
  if (ratio < RATIO_MIN - RATIO_EPSILON || ratio > RATIO_MAX + RATIO_EPSILON) {
    return `La imagen mide ${file.width}×${file.height} (relación ${ratio.toFixed(2)}:1) y Instagram sólo acepta entre 4:5 (0,80) y 1,91:1.`;
  }
  return null;
}

function videoProblem(
  file: Pick<MediaFile, "mime" | "size" | "durationSec">,
  limits: { maxBytes: number; minSeconds: number; maxSeconds: number },
): string | null {
  if (!ALLOWED_VIDEO_MIMES.includes(file.mime)) {
    return "El video tiene que ser MP4 o MOV.";
  }
  if (file.size > limits.maxBytes) {
    return `El video pesa ${formatMb(file.size)} y el máximo es ${formatMb(limits.maxBytes)}.`;
  }
  if (file.durationSec !== null) {
    if (file.durationSec < limits.minSeconds) {
      return `El video dura ${formatDuration(file.durationSec)} y el mínimo es ${limits.minSeconds} s.`;
    }
    if (file.durationSec > limits.maxSeconds) {
      return `El video dura ${formatDuration(file.durationSec)} y el máximo es ${formatDuration(limits.maxSeconds)}.`;
    }
  }
  return null;
}

/**
 * ¿Sirve este archivo para este tipo de pieza? Se llama antes de subirlo, con
 * lo que el navegador puede medir del archivo local. Devuelve el motivo
 * concreto del rechazo, o null si pasa.
 */
export function validateFileForKind(
  kind: string,
  file: Pick<MediaFile, "type" | "mime" | "size" | "width" | "height" | "durationSec">,
  alreadyAttached: number,
): string | null {
  switch (kind) {
    case "REEL":
    case "VIDEO":
      if (alreadyAttached >= 1) return "Un reel lleva un solo video. Sacá el actual antes de subir otro.";
      if (file.type !== "VIDEO") return "Un reel es un video (MP4 o MOV), no una imagen.";
      return videoProblem(file, { maxBytes: REEL_MAX_BYTES, minSeconds: REEL_MIN_SECONDS, maxSeconds: REEL_MAX_SECONDS });

    case "POST":
      if (alreadyAttached >= 1) return "Un post lleva una sola imagen. Sacá la actual antes de subir otra.";
      if (file.type !== "IMAGE") return "Un post es una imagen JPEG. Para publicar un video, cambiá el tipo a Reel.";
      return imageProblem(file) ?? feedRatioProblem(file);

    case "CARRUSEL":
      if (alreadyAttached >= CAROUSEL_MAX_FILES) return `Un carrusel admite hasta ${CAROUSEL_MAX_FILES} imágenes.`;
      if (file.type !== "IMAGE") return "Un carrusel no admite video: sólo imágenes JPEG.";
      return imageProblem(file) ?? feedRatioProblem(file);

    case "HISTORIA":
      if (alreadyAttached >= 1) return "Una historia lleva un solo archivo. Sacá el actual antes de subir otro.";
      if (file.type === "IMAGE") return imageProblem(file);
      return videoProblem(file, {
        maxBytes: STORY_VIDEO_MAX_BYTES,
        minSeconds: STORY_MIN_SECONDS,
        maxSeconds: STORY_MAX_SECONDS,
      });

    default:
      return "Este tipo de pieza no se publica en Instagram desde la app.";
  }
}

/**
 * ¿Está el conjunto de archivos listo para publicar? Revalida cada archivo
 * con las mismas reglas (el tipo de pieza pudo cambiar después de subir) y
 * suma la cantidad. Devuelve el motivo, o null si se puede publicar.
 */
export function validateMediaForPublish(kind: string, media: MediaFile[]): string | null {
  if (!isPublishableKind(kind)) return "Este tipo de pieza no se publica en Instagram desde la app.";
  if (media.length === 0) return "Falta subir el archivo de la pieza.";
  if (kind === "CARRUSEL" && media.length < CAROUSEL_MIN_FILES) {
    return `Un carrusel necesita al menos ${CAROUSEL_MIN_FILES} imágenes (hay ${media.length}).`;
  }

  for (const [index, file] of media.entries()) {
    // `alreadyAttached: 0` para no rechazar por cantidad lo que ya se validó al subir
    const problem = validateFileForKind(kind, file, 0);
    if (problem) return media.length > 1 ? `Archivo ${index + 1} (${file.name}): ${problem}` : problem;
  }
  if (media.length > 1 && kind !== "CARRUSEL") return "Este tipo de pieza lleva un solo archivo.";
  if (media.length > CAROUSEL_MAX_FILES) return `Un carrusel admite hasta ${CAROUSEL_MAX_FILES} imágenes.`;
  return null;
}

/** Lo que dice el `accept` del input de archivos, según el tipo de pieza. */
export function acceptForKind(kind: string): string {
  switch (kind) {
    case "REEL":
    case "VIDEO":
      return ".mp4,.mov,video/mp4,video/quicktime";
    case "POST":
    case "CARRUSEL":
      return ".jpg,.jpeg,image/jpeg";
    case "HISTORIA":
      return ".jpg,.jpeg,.mp4,.mov,image/jpeg,video/mp4,video/quicktime";
    default:
      return "";
  }
}

/** Una línea con lo que admite cada tipo, para mostrar al lado del selector de archivos. */
export function requirementsForKind(kind: string): string {
  switch (kind) {
    case "REEL":
    case "VIDEO":
      return "MP4 o MOV, hasta 1 GB, de 3 s a 15 min. 9:16 recomendado.";
    case "POST":
      return "JPEG, hasta 8 MB, relación entre 4:5 y 1,91:1.";
    case "CARRUSEL":
      return "De 2 a 10 imágenes JPEG de hasta 8 MB, entre 4:5 y 1,91:1. No admite video.";
    case "HISTORIA":
      return "Imagen JPEG hasta 8 MB, o video MP4/MOV hasta 100 MB y de 3 a 60 s. Sin caption.";
    default:
      return "Este tipo de pieza no se publica en Instagram desde la app.";
  }
}
