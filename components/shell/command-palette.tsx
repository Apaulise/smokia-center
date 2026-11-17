"use client";

import { ListChecks, LoaderCircle, Search, User, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { matchCommands } from "@/components/shell/commands";
import { startNavigation } from "@/components/shell/navigation-state";
import { Kbd } from "@/components/ui/button";
import { searchCommandPaletteAction } from "@/lib/leads/actions";
import { STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import { cn } from "@/lib/utils";

/**
 * ⌘K: buscar leads y listas por nombre, ir a cualquier pantalla de cualquier
 * gestor, o crear un turno. Las pantallas salen de commands.ts (y de ahí de la
 * navegación), y la búsqueda no distingue tildes ni mayúsculas.
 * ESC cierra; ↑↓ navega; ↵ abre.
 *
 * `CommandPalette` sólo monta `Palette` mientras `open` es true: así cada
 * apertura es un mount nuevo (los `useState` arrancan limpios solos) y no
 * hace falta un efecto que resetee query/resultados al abrir.
 */
type Group = "LEADS" | "LISTAS" | "IR A" | "ACCIONES";

type ResultItem = {
  key: string;
  group: Group;
  label: string;
  meta?: string;
  shortcut?: string;
  href: string;
  icon: LucideIcon;
};

const GROUP_ORDER: Group[] = ["LEADS", "LISTAS", "IR A", "ACCIONES"];

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <Palette onClose={onClose} />;
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [leads, setLeads] = useState<{ id: string; name: string; status: LeadStatus }[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [completedQuery, setCompletedQuery] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);

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
        if (cancelled) return;
        setLeads(results.leads);
        setLists(results.lists);
        setSearchFailed(false);
      } catch {
        // Sin red o con la base caída: se avisa y las pantallas se siguen pudiendo abrir.
        if (cancelled) return;
        setLeads([]);
        setLists([]);
        setSearchFailed(true);
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
  // todavía tengan la última respuesta: derivado en el render, no en un efecto.
  const hasQuery = query.trim().length > 0;
  const searching = hasQuery && completedQuery !== query.trim();

  const items: ResultItem[] = useMemo(
    () => [
      ...(hasQuery ? leads : []).map((lead) => ({
        key: `lead-${lead.id}`,
        group: "LEADS" as const,
        label: lead.name,
        meta: STATUS_LABEL[lead.status],
        href: `/leads/${lead.id}`,
        icon: User,
      })),
      ...(hasQuery ? lists : []).map((list) => ({
        key: `list-${list.id}`,
        group: "LISTAS" as const,
        label: list.name,
        href: `/leads/lista/${list.id}`,
        icon: ListChecks,
      })),
      ...matchCommands(query).map((command) => ({
        key: command.key,
        group: command.group,
        label: command.label,
        meta: command.section,
        shortcut: command.shortcut,
        href: command.href,
        icon: command.icon,
      })),
    ],
    [hasQuery, leads, lists, query],
  );

  // Derivado, no estado: si la lista se achica, el índice activo se recorta acá mismo.
  const activeIndexSafe = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);
  const activeItem = items[activeIndexSafe];

  function go(href: string) {
    startNavigation(href.split(/[?#]/)[0]);
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
      } else if (event.key === "Enter" && !event.isComposing) {
        event.preventDefault();
        if (activeItem) go(activeItem.href);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeItem]);

  // El elegido con las flechas siempre queda a la vista.
  useEffect(() => {
    if (activeItem) listRef.current?.querySelector(`[data-key="${CSS.escape(activeItem.key)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeItem]);

  const groups = GROUP_ORDER.map((name) => ({ name, items: items.filter((item) => item.group === name) })).filter((group) => group.items.length > 0);

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-50 flex justify-center px-4 pt-[min(96px,12vh)]" role="dialog" aria-modal="true" aria-label="Buscar o ir a">
      <div className="absolute inset-0 bg-lm-scrim backdrop-blur-[3px]" onClick={onClose} aria-hidden />
      <div className="lm-shadow-pop lm-rise relative flex h-max max-h-[70vh] w-full max-w-[600px] flex-col overflow-hidden rounded-lm-xl border border-lm-line-strong lm-glass-pop font-lm-sans">
        <div className="flex h-[52px] shrink-0 items-center gap-2.5 border-b border-lm-line px-4">
          <Search className="size-4 shrink-0 text-lm-ink-3" strokeWidth={1.5} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value.slice(0, 80));
              setActiveIndex(0);
            }}
            placeholder="Buscar un lead, una lista o una pantalla…"
            aria-label="Buscar"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={activeItem ? `palette-${activeItem.key}` : undefined}
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] text-lm-ink placeholder:text-lm-ink-3 focus:outline-none"
            style={{ caretColor: "var(--color-lm-signal)" }}
          />
          {searching ? <LoaderCircle className="size-4 shrink-0 animate-spin text-lm-ink-3" strokeWidth={1.5} aria-label="Buscando" /> : null}
          <Kbd className="hidden sm:inline">esc</Kbd>
        </div>

        <div ref={listRef} id="palette-results" role="listbox" className="flex-1 overflow-y-auto overscroll-contain py-2">
          {searchFailed && hasQuery ? (
            <p className="px-4 pb-2 text-[12.5px] text-lm-danger" role="status">
              No se pudieron buscar leads ni listas. Las pantallas se pueden abrir igual.
            </p>
          ) : null}
          {groups.length === 0 ? (
            <p className="px-4 py-6 text-center text-[13px] text-lm-ink-3">
              {searching ? "Buscando…" : `Nada coincide con «${query.trim()}».`}
            </p>
          ) : (
            groups.map((group) => (
              <div key={group.name} className="px-2 py-1.5" role="group" aria-label={group.name}>
                <p className="px-2 pb-1 text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">{group.name}</p>
                {group.items.map((item) => {
                  flatIndex += 1;
                  const index = flatIndex;
                  const active = index === activeIndexSafe;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.key}
                      id={`palette-${item.key}`}
                      data-key={item.key}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onMouseMove={() => setActiveIndex(index)}
                      onClick={() => go(item.href)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lm-md px-2.5 py-2 text-left text-[13px] transition-colors duration-100",
                        active ? "bg-lm-signal-soft text-lm-ink" : "text-lm-ink-2",
                      )}
                    >
                      <Icon className={cn("size-3.5 shrink-0", active ? "text-lm-signal-text" : "text-lm-ink-3")} strokeWidth={1.5} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.meta ? <span className="shrink-0 text-xs text-lm-ink-3">{item.meta}</span> : null}
                      {item.shortcut ? (
                        <span className="hidden shrink-0 gap-0.5 sm:flex" aria-label={`Atajo: ${item.shortcut}`}>
                          {item.shortcut.split(" ").map((key, keyIndex) => (
                            <Kbd key={keyIndex}>{key}</Kbd>
                          ))}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-lm-line px-4 py-2 font-mono text-[11px] text-lm-ink-3 sm:flex">
          <span>↑↓ moverse</span>
          <span>↵ abrir</span>
          <span className="ml-auto font-lm-sans">Fuera de esta ventana: G y una letra para ir, N T para un turno nuevo</span>
        </div>
      </div>
    </div>
  );
}
