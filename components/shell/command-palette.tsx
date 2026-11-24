"use client";

import { ListChecks, LoaderCircle, Search, User, X, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

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
  const closeRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [leads, setLeads] = useState<{ id: string; name: string; status: LeadStatus }[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [completedQuery, setCompletedQuery] = useState("");
  const [searchFailed, setSearchFailed] = useState(false);

  useEffect(() => {
    const previous = document.activeElement;
    inputRef.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
    };
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

  const term = query.trim();
  const hasQuery = term.length > 0;
  // Una respuesta de la consulta anterior no es seleccionable por clic ni Enter.
  const currentResults = hasQuery && completedQuery === term;
  const searching = hasQuery && !currentResults;

  const items: ResultItem[] = useMemo(
    () => [
      ...(currentResults ? leads : []).map((lead) => ({
        key: `lead-${lead.id}`,
        group: "LEADS" as const,
        label: lead.name,
        meta: STATUS_LABEL[lead.status],
        href: `/leads/${lead.id}`,
        icon: User,
      })),
      ...(currentResults ? lists : []).map((list) => ({
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
    [currentResults, leads, lists, query],
  );

  // Derivado, no estado: si la lista se achica, el índice activo se recorta acá mismo.
  const activeIndexSafe = items.length === 0 ? 0 : Math.min(activeIndex, items.length - 1);
  const activeItem = items[activeIndexSafe];

  function go(href: string) {
    startNavigation(href.split(/[?#]/)[0]);
    router.push(href);
    onClose();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key === "Tab") {
      const end = event.shiftKey ? inputRef.current : closeRef.current;
      if (event.target === end) {
        event.preventDefault();
        (event.shiftKey ? closeRef.current : inputRef.current)?.focus();
      }
      return;
    }
    if (event.target !== inputRef.current) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex(Math.min(Math.max(0, items.length - 1), activeIndexSafe + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(0, activeIndexSafe - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeItem) go(activeItem.href);
    }
  }

  // El elegido con las flechas siempre queda a la vista.
  useEffect(() => {
    if (activeItem) listRef.current?.querySelector(`[data-key="${CSS.escape(activeItem.key)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [activeItem]);

  const groups = GROUP_ORDER.map((name) => ({ name, items: items.filter((item) => item.group === name) })).filter((group) => group.items.length > 0);

  let flatIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-lm-scrim px-[max(0.75rem,env(safe-area-inset-left,0px),env(safe-area-inset-right,0px))] pt-[max(0.75rem,env(safe-area-inset-top,0px))] lg:px-4 lg:pt-[min(96px,12dvh)] lg:pointer-fine:backdrop-blur-[3px]"
      role="dialog"
      aria-modal="true"
      aria-label="Buscar o ir a"
      onKeyDown={onKeyDown}
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="lm-shadow-pop relative flex h-max max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] w-full max-w-xl flex-col overflow-hidden rounded-lm-xl border border-lm-line-strong lm-glass-pop font-lm-sans lg:max-h-[70dvh]">
        <div className="flex min-h-14 shrink-0 items-center gap-2 border-b border-lm-line px-3 sm:gap-2.5 sm:px-4">
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
            enterKeyHint="search"
            autoComplete="off"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={activeItem ? `palette-${activeItem.key}` : undefined}
            className="min-h-11 min-w-0 flex-1 rounded-lm-sm bg-transparent px-1 text-base text-lm-ink placeholder:text-lm-ink-3 focus-visible:lm-focus"
            style={{ caretColor: "var(--color-lm-signal)" }}
          />
          {searching ? <LoaderCircle className="size-4 shrink-0 text-lm-ink-3 motion-safe:animate-spin" strokeWidth={1.5} aria-label="Buscando" /> : null}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar búsqueda"
            title="Cerrar búsqueda"
            className="grid size-11 shrink-0 touch-manipulation place-items-center rounded-full text-lm-ink-2 active:bg-lm-ink/12 hover:bg-lm-ink/8 focus-visible:lm-focus lg:pointer-fine:size-8"
          >
            <X className="size-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>

        <div ref={listRef} id="palette-results" role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-2">
          {searchFailed && currentResults ? (
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
                      tabIndex={-1}
                      aria-selected={active}
                      onPointerMove={(event) => { if (event.pointerType === "mouse") setActiveIndex(index); }}
                      onClick={() => go(item.href)}
                      className={cn(
                        "flex min-h-11 w-full touch-manipulation items-center gap-2.5 rounded-lm-md px-2.5 py-2 text-left text-[13px] transition-colors duration-100 active:bg-lm-signal-soft lg:pointer-fine:min-h-9",
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
