"use client";

import { Camera, Shuffle, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input } from "@/components/leads/ui/field";
import { ProfileAvatar } from "@/components/shell/profile-avatar";
import { saveProfile } from "@/lib/profile/actions";
import { AVATAR_BUCKET, DICEBEAR_STYLES, dicebearUrl, type DicebearStyle } from "@/lib/profile/avatars";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const AVATARS_PER_PAGE = 12;
const PHOTO_SIZE = 256;

function randomSeeds() {
  return Array.from({ length: AVATARS_PER_PAGE }, () => Math.random().toString(36).slice(2, 8));
}

/** Recorta al centro y achica a 256×256: la foto de perfil nunca necesita más. */
async function squareThumbnail(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = PHOTO_SIZE;
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
  bitmap.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("toBlob"))), "image/webp", 0.85),
  );
}

/**
 * El círculo de perfil de la pantalla global: al apretarlo abre el editor de
 * alias y avatar. Dos orígenes de avatar: foto propia (se sube directo al
 * bucket, en la carpeta del usuario) o la biblioteca DiceBear.
 */
export function ProfileEditor({
  userId,
  name,
  alias,
  avatarUrl,
}: {
  userId: string;
  name: string;
  alias: string | null;
  avatarUrl: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative cursor-pointer rounded-full focus-visible:lm-focus"
        aria-label="Editar perfil"
        title="Editar perfil"
      >
        <ProfileAvatar url={avatarUrl} name={name} className="size-12 text-lg transition-[border-color] duration-300 group-hover:border-lm-ink-2" />
        <span className="absolute -right-0.5 -bottom-0.5 flex size-5 items-center justify-center rounded-full border border-lm-line-strong bg-lm-surface text-lm-ink-2 transition-colors group-hover:text-lm-ink">
          <Camera className="size-3" strokeWidth={1.5} />
        </span>
      </button>

      {/* Se monta sólo abierto: cada apertura arranca con los valores guardados. */}
      {open ? (
        <EditorDialog userId={userId} alias={alias} avatarUrl={avatarUrl} name={name} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}

function EditorDialog({
  userId,
  name,
  alias,
  avatarUrl,
  onClose,
}: {
  userId: string;
  name: string;
  alias: string | null;
  avatarUrl: string | null;
  onClose: () => void;
}) {
  const [aliasValue, setAliasValue] = useState(alias ?? "");
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [tab, setTab] = useState<"library" | "upload">("library");
  const [style, setStyle] = useState<DicebearStyle>("lorelei");
  const [seeds, setSeeds] = useState<string[]>(randomSeeds);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  // Foto subida en esta sesión y todavía no guardada: si se cambia o se cancela, se borra.
  const stagedPath = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const supabase = createClient();
  const previewName = aliasValue.trim() || name;
  const visibleSeeds = search.trim() ? [search.trim(), ...seeds.slice(0, AVATARS_PER_PAGE - 1)] : seeds;

  async function discardStaged() {
    if (!stagedPath.current) return;
    await supabase.storage.from(AVATAR_BUCKET).remove([stagedPath.current]);
    stagedPath.current = null;
  }

  async function onPickFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("Elegí un archivo de imagen.");
      return;
    }
    setUploading(true);
    try {
      const blob = await squareThumbnail(file);
      await discardStaged();
      const path = `${userId}/${Date.now()}.webp`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, blob, { contentType: "image/webp", upsert: false });
      if (uploadError) throw uploadError;
      stagedPath.current = path;
      setAvatar(supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl);
    } catch {
      setError("No se pudo subir la foto. Probá con otra imagen.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function pickLibraryAvatar(url: string) {
    setAvatar(url);
    await discardStaged();
  }

  async function removeAvatar() {
    setAvatar(null);
    await discardStaged();
  }

  async function close() {
    await discardStaged();
    onClose();
  }

  function save() {
    setError(null);
    startSaving(async () => {
      const result = await saveProfile({ alias: aliasValue, avatarUrl: avatar });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      stagedPath.current = null; // ya es la foto vigente: no se descarta
      onClose();
    });
  }

  return (
    <Dialog open onClose={close} title="Tu perfil" description="Cómo te ve la app y quien comparte el espacio con vos.">
      <div className="flex flex-col gap-5 overflow-y-auto p-5">
        <div className="flex items-center gap-4">
          <ProfileAvatar url={avatar} name={previewName} className="size-20 text-3xl" />
          <Field label="Alias" htmlFor="profile-alias" className="flex-1" hint="Entre 2 y 30 caracteres.">
            <Input
              id="profile-alias"
              value={aliasValue}
              maxLength={30}
              placeholder="Cómo querés que te llame"
              onChange={(event) => setAliasValue(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div role="tablist" className="flex gap-1 border-b border-lm-line">
            {(
              [
                ["library", "Biblioteca de avatares"],
                ["upload", "Subir foto"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "-mb-px cursor-pointer border-b-2 px-3 py-2 text-[13px] transition-colors",
                  tab === key ? "border-lm-signal text-lm-ink" : "border-transparent text-lm-ink-2 hover:text-lm-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "library" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-1.5">
                {DICEBEAR_STYLES.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setStyle(option.id)}
                    className={cn(
                      "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
                      style === option.id
                        ? "border-lm-signal bg-lm-signal-soft text-lm-signal-text"
                        : "border-lm-line-strong text-lm-ink-2 hover:text-lm-ink",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  value={search}
                  maxLength={40}
                  placeholder="Escribí una palabra y mirá qué avatar sale…"
                  aria-label="Buscar avatar por palabra"
                  onChange={(event) => setSearch(event.target.value)}
                />
                <Button type="button" onClick={() => setSeeds(randomSeeds())} aria-label="Mezclar avatares" title="Mezclar">
                  <Shuffle className="size-3.5" />
                  Mezclar
                </Button>
              </div>

              <div className="grid grid-cols-4 gap-2.5 sm:grid-cols-6">
                {visibleSeeds.map((seed) => {
                  const url = dicebearUrl(style, seed);
                  return (
                    <button
                      key={`${style}-${seed}`}
                      type="button"
                      onClick={() => pickLibraryAvatar(url)}
                      aria-label={`Elegir avatar ${seed}`}
                      className={cn(
                        "cursor-pointer overflow-hidden rounded-full border-2 transition-[transform,border-color] duration-200 hover:scale-105",
                        avatar === url ? "border-lm-signal" : "border-transparent hover:border-lm-line-strong",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" loading="lazy" className="aspect-square w-full bg-lm-surface" draggable={false} />
                    </button>
                  );
                })}
              </div>
              <p className="text-[11.5px] text-lm-ink-3">Ilustraciones de DiceBear, licencia CC0.</p>
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={(event) => onPickFile(event.target.files?.[0])}
              />
              <Button type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>
                <Upload className="size-3.5" />
                {uploading ? "Subiendo…" : "Elegir una foto"}
              </Button>
              <p className="text-[12.5px] leading-[1.5] text-lm-ink-3">
                JPG, PNG o WebP. Se recorta al centro en un cuadrado y se achica a {PHOTO_SIZE}×{PHOTO_SIZE}.
              </p>
            </div>
          )}
        </div>

        {error ? <p className="text-xs text-lm-danger">{error}</p> : null}

        <div className="flex items-center justify-between gap-2 border-t border-lm-line pt-4">
          <Button type="button" variant="ghost" onClick={removeAvatar} disabled={!avatar}>
            Quitar imagen
          </Button>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={close}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={save} disabled={saving || uploading || aliasValue.trim().length < 2}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
