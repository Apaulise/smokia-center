"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { cn } from "@/lib/utils";

/**
 * "12 / 30" + K/J (Design System §07): anterior/siguiente lead dentro de la
 * lista, por click o por teclado. `ids` viene de `listLeadIdsForNav`, en el
 * mismo orden que la tabla/kanban de la lista.
 */
export function LeadNav({ ids, currentId }: { ids: string[]; currentId: string }) {
  const router = useRouter();
  const index = ids.indexOf(currentId);
  const prevId = index > 0 ? ids[index - 1] : null;
  const nextId = index >= 0 && index < ids.length - 1 ? ids[index + 1] : null;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (target?.isContentEditable) return;
      if (event.key === "k" && prevId) router.push(`/leads/${prevId}`);
      if (event.key === "j" && nextId) router.push(`/leads/${nextId}`);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevId, nextId, router]);

  if (index < 0) return null;

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[11px] text-lm-ink-3">
        {index + 1} / {ids.length}
      </span>
      <div className="flex gap-1">
        <NavKey label="K" href={prevId ? `/leads/${prevId}` : null} title="Lead anterior" />
        <NavKey label="J" href={nextId ? `/leads/${nextId}` : null} title="Lead siguiente" />
      </div>
    </div>
  );
}

function NavKey({ label, href, title }: { label: string; href: string | null; title: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      title={title}
      disabled={!href}
      onClick={() => href && router.push(href)}
      className={cn(
        "flex size-6 items-center justify-center rounded-lm-xs border border-lm-line font-mono text-[10.5px] font-medium text-lm-ink-3",
        href ? "hover:border-lm-line-strong hover:text-lm-ink" : "opacity-40",
      )}
    >
      {label}
    </button>
  );
}
