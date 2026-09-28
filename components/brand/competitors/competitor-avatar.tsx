"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * La foto de perfil de una cuenta seguida. Las URLs del CDN de Instagram
 * caducan a los pocos días, así que una foto guardada puede dejar de cargar:
 * en ese caso cae a la inicial, mismo criterio que `PostThumb`.
 */
export function CompetitorAvatar({
  url,
  username,
  className,
}: {
  url: string | null;
  username: string;
  className?: string;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = url !== null && failedUrl !== url;

  return (
    <div
      className={cn(
        "relative size-9 shrink-0 overflow-hidden rounded-full border border-lm-line-strong bg-lm-raised",
        "flex items-center justify-center",
        className,
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa de Instagram, mismo criterio que PostThumb
        <img src={url} alt="" className="size-full object-cover" onError={() => setFailedUrl(url)} />
      ) : (
        <span aria-hidden className="text-sm text-lm-ink-2 uppercase">
          {username.slice(0, 1)}
        </span>
      )}
    </div>
  );
}
