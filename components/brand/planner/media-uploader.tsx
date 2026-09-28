"use client";

import { Film, Loader2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { attachItemMedia, removeItemMedia } from "@/lib/brand/planner/actions";
import {
  acceptForKind,
  CAROUSEL_MAX_FILES,
  requirementsForKind,
  validateFileForKind,
  type MediaFile,
  type MediaType,
} from "@/lib/brand/planner/rules";
import { BRAND_MEDIA_BUCKET } from "@/lib/brand/planner/schema";
import { createClient } from "@/lib/supabase/client";

const EXTENSION_MIME: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};

function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

/** Algunos sistemas no informan el tipo de un .mov: se completa por la extensión. */
function mimeOf(file: File) {
  return file.type || EXTENSION_MIME[extensionOf(file.name)] || "";
}

function typeOf(mime: string): MediaType {
  return mime.startsWith("video/") ? "VIDEO" : "IMAGE";
}

/** Mide lo que las reglas necesitan (dimensiones, duración) leyendo el archivo local, sin subirlo. */
function measure(file: File, type: MediaType): Promise<Pick<MediaFile, "width" | "height" | "durationSec">> {
  const url = URL.createObjectURL(file);
  const unknown = { width: null, height: null, durationSec: null };

  return new Promise((resolve) => {
    if (type === "IMAGE") {
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: image.naturalWidth, height: image.naturalHeight, durationSec: null });
      };
      image.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(unknown);
      };
      image.src = url;
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth || null,
        height: video.videoHeight || null,
        durationSec: Number.isFinite(video.duration) ? video.duration : null,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(unknown);
    };
    video.src = url;
  });
}

function formatSize(bytes: number) {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(mb >= 10 ? 0 : 1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatDuration(seconds: number) {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Traduce el rechazo de Storage por tamaño a lo que hay que hacer, en vez de mostrar el texto crudo. */
function uploadErrorMessage(message: string) {
  if (/exceeded|too large|payload/i.test(message)) {
    return "Supabase rechazó el archivo por tamaño. El plan Free limita cada archivo a 50 MB en total: subí el plan o exportá el video con menos peso.";
  }
  return "No se pudo subir el archivo. Probá de nuevo.";
}

/**
 * Sube los archivos de una pieza directo al bucket `brand-media` (un video de
 * cientos de MB no puede pasar por una Server Action) y los registra en la
 * pieza. Las reglas de Instagram se validan ANTES de subir: el motivo del
 * rechazo aparece al elegir el archivo, no después de esperar la subida.
 */
export function MediaUploader({
  ownerId,
  itemId,
  kind,
  media,
  onChange,
  disabled,
}: {
  ownerId: string;
  itemId: string;
  kind: string;
  media: MediaFile[];
  onChange: (media: MediaFile[]) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);

    let current = media;
    for (const file of Array.from(files)) {
      setBusy(`Revisando ${file.name}…`);
      const mime = mimeOf(file);
      const type = typeOf(mime);
      const measured = await measure(file, type);
      const meta = { type, mime, size: file.size, ...measured };

      const problem = validateFileForKind(kind, meta, current.length);
      if (problem) {
        setError(`${file.name}: ${problem}`);
        break;
      }

      setBusy(`Subiendo ${file.name}…`);
      const path = `${ownerId}/${itemId}/${crypto.randomUUID()}.${extensionOf(file.name) || "bin"}`;
      const upload = await supabase.storage.from(BRAND_MEDIA_BUCKET).upload(path, file, { contentType: mime, upsert: false });
      if (upload.error) {
        setError(uploadErrorMessage(upload.error.message));
        break;
      }

      const result = await attachItemMedia(itemId, { path, name: file.name, ...meta });
      if (!result.ok) {
        setError(result.message);
        break;
      }
      current = result.media;
      onChange(current);
    }

    setBusy(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleRemove(path: string) {
    setError(null);
    setBusy("Sacando el archivo…");
    const result = await removeItemMedia(itemId, path);
    setBusy(null);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onChange(result.media);
  }

  const accept = acceptForKind(kind);
  // Un reel, post o historia lleva un solo archivo: para cambiarlo se saca el actual primero.
  const canAdd = kind === "CARRUSEL" ? media.length < CAROUSEL_MAX_FILES : media.length < 1;

  return (
    <div className="space-y-3">
      <p className="text-xs text-lm-ink-2">{requirementsForKind(kind)}</p>

      {media.length > 0 ? (
        <ul className="space-y-2">
          {media.map((file, index) => (
            <li key={file.path} className="flex items-center gap-3 rounded-lm-md border border-lm-line bg-lm-surface p-2">
              <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lm-md bg-lm-bg text-lm-ink-2">
                {file.type === "IMAGE" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL pública del bucket, tamaño de miniatura
                  <img
                    src={supabase.storage.from(BRAND_MEDIA_BUCKET).getPublicUrl(file.path).data.publicUrl}
                    alt=""
                    className="size-full object-cover"
                  />
                ) : (
                  <Film className="size-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-lm-ink">
                  {media.length > 1 ? `${index + 1}. ` : ""}
                  {file.name}
                </p>
                <p className="tabular text-xs text-lm-ink-2">
                  {formatSize(file.size)}
                  {file.durationSec !== null ? ` · ${formatDuration(file.durationSec)}` : ""}
                  {file.width && file.height ? ` · ${file.width}×${file.height}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Sacar ${file.name}`}
                disabled={disabled || busy !== null}
                onClick={() => handleRemove(file.path)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {accept && canAdd ? (
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            multiple={kind === "CARRUSEL"}
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={disabled || busy !== null}
            onClick={() => inputRef.current?.click()}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
            {kind === "CARRUSEL" ? "Agregar imágenes" : "Subir archivo"}
          </Button>
          {busy ? <span className="text-xs text-lm-ink-2">{busy}</span> : null}
        </div>
      ) : null}

      {error ? <p className="text-xs text-lm-danger">{error}</p> : null}
    </div>
  );
}
