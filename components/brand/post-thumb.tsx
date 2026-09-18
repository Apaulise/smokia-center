import { Eye } from "lucide-react";

import { cn } from "@/lib/utils";

/** Miniatura 9:16 de una pieza (thumbnail de Instagram, o un placeholder si no hay). El ancho lo define quien la usa. */
export function PostThumb({ url, className }: { url: string | null; className?: string }) {
  return (
    <div
      className={cn(
        "relative aspect-9/16 shrink-0 overflow-hidden rounded-[10px] border border-line bg-elevated",
        className,
      )}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL externa de Instagram, mismo criterio que la biblioteca
        <img src={url} alt="" className="size-full object-cover" />
      ) : (
        <div className="flex size-full items-center justify-center text-muted">
          <Eye className="size-4" />
        </div>
      )}
    </div>
  );
}
