import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink",
        "placeholder:text-muted",
        "transition-colors duration-200",
        "focus-visible:border-cyan/40 focus-visible:ring-2 focus-visible:ring-cyan/60 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      {...props}
    />
  );
}
