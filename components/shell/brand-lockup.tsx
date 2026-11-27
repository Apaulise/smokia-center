import Image from "next/image";

import { cn } from "@/lib/utils";

export function BrandLockup({ large = false, className }: { large?: boolean; className?: string }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center font-lm-sans text-lm-ink", large ? "gap-4" : "gap-2.5", className)}>
      <Image
        src="/altab-simbolo-metal.svg"
        alt=""
        width={378}
        height={235}
        className={cn("w-auto shrink-0", large ? "h-14" : "h-6")}
        unoptimized
      />
      <span className={cn("flex flex-col leading-none", large ? "gap-1.5" : "gap-0.5")}>
        <span className={cn("font-extrabold tracking-[-0.04em]", large ? "text-5xl leading-none" : "text-xl leading-none")}>ALTAB</span>
        <span className={cn("whitespace-nowrap font-semibold tracking-[0.18em] text-lm-ink-2", large ? "text-[11px]" : "text-[8px]")}>AI CONSULTING</span>
      </span>
    </span>
  );
}
