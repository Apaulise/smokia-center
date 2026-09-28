"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Miniatura de una pieza (thumbnail de Instagram, o el rayado placeholder del
 * sistema si no hay). Por defecto 9:16; la proporción y el ancho los define
 * quien la usa (`className`, "aspect-3/4", "w-10", etc.). `bare` la deja sin
 * borde ni radio, para cuando la portada ocupa el borde de una card que ya
 * recorta con `overflow-hidden`.
 *
 * Las URLs de imagen del CDN de Instagram caducan a los pocos días, así que una
 * miniatura guardada puede dejar de cargar: en ese caso cae al mismo
 * placeholder en vez de mostrar una imagen rota.
 */
export function PostThumb({ url, className, bare }: { url: string | null; className?: string; bare?: boolean }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && failedUrl !== url;

  return (
    <div
      className={cn(
        "lm-stripes relative aspect-9/16 shrink-0 overflow-hidden",
        !bare && "rounded-lm-sm border border-lm-line",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa de Instagram, sin loader de next/image configurado para ese host
        <img src={url} alt="" loading="lazy" decoding="async" className="size-full object-cover" onError={() => setFailedUrl(url)} />
      ) : null}
    </div>
  );
}
