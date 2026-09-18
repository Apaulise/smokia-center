"use client";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type ChatThreadRow = Database["public"]["Tables"]["brand_chat_threads"]["Row"];

function formatThreadDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
}

/** Historial de conversaciones (Plans/03 §3.6): una lista para volver a cualquier hilo, no sólo al último. */
export function ChatThreadList({
  threads,
  activeId,
  loading,
  onSelect,
  onNew,
  newDisabled,
}: {
  threads: ChatThreadRow[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  newDisabled: boolean;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-line/60 p-3">
        <Button type="button" variant="secondary" size="sm" className="w-full" onClick={onNew} disabled={newDisabled}>
          <Plus className="size-3.5" />
          Nueva conversación
        </Button>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto p-2">
        {threads.length === 0 ? (
          <li className="px-2 py-3 text-xs text-muted">Todavía no hay conversaciones guardadas.</li>
        ) : (
          threads.map((thread) => {
            const active = thread.id === activeId;
            return (
              <li key={thread.id}>
                <button
                  type="button"
                  onClick={() => onSelect(thread.id)}
                  disabled={loading}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "w-full rounded-[12px] border px-3 py-2 text-left transition-colors disabled:opacity-60",
                    active ? "border-cyan/30 bg-surface/70" : "border-transparent hover:bg-surface/40",
                  )}
                >
                  <span className="line-clamp-2 text-sm text-ink">{thread.title ?? "Conversación sin título"}</span>
                  {/* La fecha se formatea en la zona horaria de quien mira: server y cliente pueden diferir. */}
                  <time dateTime={thread.created_at} suppressHydrationWarning className="mt-0.5 block text-xs text-muted">
                    {formatThreadDate(thread.created_at)}
                  </time>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
