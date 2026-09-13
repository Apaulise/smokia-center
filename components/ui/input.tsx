import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink",
        "placeholder:text-muted/60",
        "focus-visible:border-cyan/50 focus-visible:ring-2 focus-visible:ring-cyan/30 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
