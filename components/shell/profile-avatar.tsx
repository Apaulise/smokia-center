import { cn } from "@/lib/utils";

/**
 * Círculo de perfil: la imagen elegida o, sin imagen, la inicial del nombre.
 * `<img>` común a propósito: los avatares de DiceBear son SVG remotos y no
 * ganan nada pasando por el optimizador de next/image.
 */
export function ProfileAvatar({
  url,
  name,
  className,
}: {
  url: string | null;
  name: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-lm-line-strong bg-lm-raised font-lm-sans font-medium text-lm-ink",
        className,
      )}
      aria-hidden="true"
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" className="size-full object-cover" draggable={false} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
