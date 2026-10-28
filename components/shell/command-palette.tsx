"use client";

import { Calendar, LayoutDashboard, ListChecks, LoaderCircle, Plus, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { searchCommandPaletteAction } from "@/lib/leads/actions";
import { STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/**
 * ⌘K (Design System §01.B): modal centrado a 96px del top, grupos LEADS /
 * LISTAS / ACCIONES con eyebrow, resultado activo con barra amarilla.
 * ESC cierra; ↑↓ navega; ↵ abre.
 *
 * `CommandPalette` sólo monta `Palette` mientras `open` es true: así cada
 * apertura es un mount nuevo (los `useState` arrancan limpios solos) y no
 * hace falta un efecto que resetee query/resultados al abrir.
 */
type ResultItem = {
  key: string;
  group: "LEADS" | "LISTAS" | "ACCIONES";
  label: string;
  meta?: string;
  shortcut?: string;
  href: string;
};

const ACTIONS: ResultItem[] = [
  { key: "a-dashboard", group: "ACCIONES", label: "Ir al dashboard", href: "/leads", shortcut: "G D" },
  { key: "a-listas", group: "ACCIONES", label: "Ver listas", href: "/leads/lista", shortcut: "G L" },
  { key: "a-generar", group: "ACCIONES", label: "Generar lista", href: "/leads/generar", shortcut: "G G" },
  { key: "a-agenda", group: "ACCIONES", label: "Ir a la agenda", href: "/leads/agenda", shortcut: "G A" },
  { key: "a-turno", group: "ACCIONES", label: "Nuevo turno", href: "/leads/agenda?nuevo=1", shortcut: "N T" },
  { key: "a-memoria", group: "ACCIONES", label: "Memoria de ventas", href: "/leads/conocimiento", shortcut: "G M" },
  { key: "a-ops", group: "ACCIONES", label: "Gestor de Operaciones", href: "/operaciones" },
  { key: "a-ops-ok", group: "ACCIONES", label: "Aprobaciones", href: "/operaciones/aprobaciones" },
  { key: "a-ops-areas", group: "ACCIONES", label: "Áreas de Operaciones", href: "/operaciones/areas" },
  { key: "a-ops-auditor", group: "ACCIONES", label: "Auditor", href: "/operaciones/auditor" },
];

const GROUP_ICON = {
  LEADS: Search,
  LISTAS: ListChecks,
  ACCIONES: LayoutDashboard,
} as const;

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Palette onClose={onClose} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [leads, setLeads] = useState<{ id: string; name: string; status: LeadStatus }[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [completedQuery, setCompletedQuery] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (!term) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const results = await searchCommandPaletteAction(term);
        if (!cancelled) {
          setLeads(results.leads);
          setLists(results.lists);
        }
      } finally {
        if (!cancelled) setCompletedQuery(term);
      }
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query]);

  // Con el campo vacío no hay búsqueda que mostrar, aunque `leads`/`lists`
  // todavía tengan la última respuesta — derivado en el render, no en un
  // efecto que los vacíe.
  const hasQuery = query.trim().length > 0;
  const searching = hasQuery && completedQuery !== query.trim();
  const visibleLeads = useMemo(() => (hasQuery ? leads : []), [hasQuery, leads]);
  const visibleLists = useMemo(() => (hasQuery ? lists : []), [hasQuery, lists]);

  const filteredActions = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return ACTIONS;
    return ACTIONS.filter((action) => action.label.toLowerCase().includes(term));
  }, [query]);

  const items: ResultItem[] = useMemo(
    () => [
      ...visibleLeads.map((lead) => ({
        key: `lead-${lead.id}`,
        group: "LEADS" as const,
        label: lead.name,
        meta: STATUS_LABEL[lead.status],
        href: `/leads/${lead.id}`,
      })),
      ...visibleLists.map((list) => ({
        key: `list-${list.id}`,
        group: "LISTAS" as const,
        label: list.name,
        href: `/leads/lista/${list.id}`,
      })),
      ...filteredActions,
    ],
    [visibleLeads, visibleLists, filteredActions],
  );

  // Derivado, no estado: si la lista de resultados se achica, el índice
  // activo se recorta acá mismo en vez de sincronizarse con un efecto.
  const activeIndexSafe = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);

  function go(href: string) {
    router.push(href);
    onClose();
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveIndex((index) => Math.min(items.length - 1, index + 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveIndex((index) => Math.max(0, index - 1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const item = items[activeIndexSafe];
        if (item) go(item.href);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeIndexSafe]);

  const groupOrder: ResultItem["group"][] = ["LEADS", "LISTAS", "ACCIONES"];
  const groups = groupOrder
    .map((name) => ({ name, items: items.filter((item) => item.group === name) }))
    .filter((group) => group.items.length > 0);

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex justify-center pt-24" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[rgb(19_19_21/0.66)]" onClick={onClose} aria-hidden />
      <div className="lm-shadow-pop relative flex h-max max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-lm-lg border border-lm-line bg-lm-raised font-lm-sans">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-lm-line px-4">
          <Search className="size-4 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Buscar leads, listas o ejecutar una acción…"
            className="h-full flex-1 bg-transparent text-[15px] text-lm-ink placeholder:text-lm-ink-3 focus:outline-none"
            style={{ caretColor: "var(--color-lm-signal)" }}
          />
          {searching ? <LoaderCircle className="size-4 animate-spin text-lm-ink-3" strokeWidth={1.5} aria-label="Buscando" /> : null}
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-lm-ink-3">Sin resultados.</p>
          ) : (
            groups.map((group) => {
              const Icon = GROUP_ICON[group.name];
              return (
                <div key={group.name} className="px-2 py-1.5">
                  <p className="px-2 pb-1 font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
                    {group.name}
                  </p>
                  {group.items.map((item) => {
                    flatIndex += 1;
                    const active = flatIndex === activeIndexSafe;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => go(item.href)}
                        className={cn(
                          "relative flex w-full items-center gap-2.5 rounded-lm-sm px-2.5 py-2 text-left text-[13px] transition-colors",
                          active ? "bg-lm-signal-soft text-lm-ink" : "text-lm-ink-2",
                          active &&
                            "before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-0.5 before:rounded-lm-xs before:bg-lm-signal",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.meta ? <span className="text-xs text-lm-ink-3">{item.meta}</span> : null}
                        {item.shortcut ? (
                          <span className="flex gap-0.5">
                            {item.shortcut.split(" ").map((key, index) => (
                              <span
                                key={index}
                                className="rounded-lm-xs border border-lm-line px-1 py-px font-mono text-[10.5px] text-lm-ink-3"
                              >
                                {key}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        <div className="flex shrink-0 items-center gap-4 border-t border-lm-line px-4 py-2 font-mono text-[11px] text-lm-ink-3">
          <span className="flex items-center gap-1">↑↓ navegar</span>
          <span className="flex items-center gap-1">↵ abrir</span>
          <span className="ml-auto flex items-center gap-1">
            <Plus className="size-3" strokeWidth={1.5} />
            <Calendar className="size-3" strokeWidth={1.5} />
          </span>
        </div>
      </div>
    </div>
  );
}
