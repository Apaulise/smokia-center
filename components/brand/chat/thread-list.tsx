"use client";

import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

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
  onDelete,
  newDisabled,
}: {
  threads: ChatThreadRow[];
  activeId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  newDisabled: boolean;
}) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  return (
    <div className="flex h-full flex-col gap-4 p-4">
      <button
        type="button"
        onClick={onNew}
        disabled={newDisabled}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lm-md border border-lm-line-strong bg-lm-surface px-3.5 py-2.5",
          "text-[13px] font-medium text-lm-ink transition-colors hover:bg-lm-raised",
          "focus-visible:lm-focus",
          "disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        <Plus className="size-4" />
        Nueva conversación
      </button>

      <ul className="flex-1 overflow-y-auto [scrollbar-color:var(--color-line)_transparent] [scrollbar-width:thin]">
        {threads.length === 0 ? (
          <li className="px-2 py-3 text-xs text-lm-ink-2">Todavía no hay conversaciones guardadas.</li>
        ) : (
          threads.map((thread) => {
            const active = thread.id === activeId;
            return (
              <li key={thread.id} className="border-b border-lm-line">
                <div className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(thread.id)}
                    disabled={loading}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "w-full border-l-2 py-3 pr-10 pl-3 text-left transition-colors disabled:opacity-60",
                      active ? "border-lm-signal" : "border-transparent hover:bg-lm-surface",
                    )}
                  >
                    <span className={cn("line-clamp-2 text-sm", active ? "font-semibold text-lm-ink" : "text-lm-ink-2")}>
                      {thread.title ?? "Conversación sin título"}
                    </span>
                    {/* La fecha se formatea en la zona horaria de quien mira: server y cliente pueden diferir. */}
                    <time dateTime={thread.created_at} suppressHydrationWarning className="mt-1 block text-xs text-lm-ink-2/70">
                      {formatThreadDate(thread.created_at)}
                    </time>
                  </button>
                  {confirmingId === thread.id ? (
                    <div className="absolute inset-y-0 right-1 flex items-center gap-1 bg-lm-surface pl-2">
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingId(null);
                          onDelete(thread.id);
                        }}
                        className="rounded-lm-md px-2 py-1 text-xs font-medium text-lm-danger hover:bg-lm-raised focus-visible:lm-focus"
                      >
                        Borrar
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingId(null)}
                        className="rounded-lm-md px-2 py-1 text-xs text-lm-ink-2 hover:bg-lm-raised focus-visible:lm-focus"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmingId(thread.id)}
                      aria-label="Eliminar conversación"
                      className="absolute top-2.5 right-2 rounded-lm-md p-1.5 text-lm-ink-2 opacity-0 transition-opacity group-hover:opacity-100 hover:text-lm-danger focus-visible:opacity-100 focus-visible:lm-focus"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
