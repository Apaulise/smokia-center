"use client";

import { ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { leadHref } from "@/lib/leads/nav-params";
import { cn } from "@/lib/utils";

/**
 * "12 / 30" + flechas (y K/J por teclado): anterior/siguiente lead dentro de la
 * selección con la que se abrió la ficha. `ids` viene de `listLeadIdsForNav`
 * con los mismos filtros y orden que la tabla; `navQuery` los conserva al saltar.
 */
export function LeadNav({ ids, currentId, navQuery }: { ids: string[]; currentId: string; navQuery: string }) {
  const router = useRouter();
  const index = ids.indexOf(currentId);
  const prevId = index > 0 ? ids[index - 1] : null;
  const nextId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;
  const prevHref = prevId ? leadHref(prevId, navQuery) : null;
  const nextHref = nextId ? leadHref(nextId, navQuery) : null;

  useEffect(() => {
    if (prevHref) router.prefetch(prevHref);
    if (nextHref) router.prefetch(nextHref);

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if ((event.key === "k" || event.key === "ArrowLeft") && prevHref) router.push(prevHref);
      if ((event.key === "j" || event.key === "ArrowRight") && nextHref) router.push(nextHref);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevHref, nextHref, router]);

  if (index < 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] text-lm-ink-3">
        {index + 1} / {ids.length}
      </span>
      <div className="flex gap-1">
        <NavKey icon={ChevronLeft} href={prevHref} title="Lead anterior (← o K)" />
        <NavKey icon={ChevronRight} href={nextHref} title="Lead siguiente (→ o J)" />
      </div>
    </div>
  );
}

function NavKey({ icon: Icon, href, title }: { icon: LucideIcon; href: string | null; title: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      title={title}
      disabled={!href}
      onClick={() => href && router.push(href)}
      className={cn(
        "flex size-7 items-center justify-center rounded-lm-xs border border-lm-line text-lm-ink-2",
        href ? "hover:border-lm-line-strong hover:text-lm-ink" : "opacity-40",
      )}
    >
      <Icon className="size-4" strokeWidth={1.5} />
    </button>
  );
}
