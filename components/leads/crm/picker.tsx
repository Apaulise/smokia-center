"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/field";
import { controlSize } from "@/components/leads/crm/styles";
import { cn } from "@/lib/utils";
import styles from "./picker.module.css";

export type PickerOption = { value: string; label: string; group?: string; swatch?: string };
type Selection =
  | { multiple: true; value?: string[]; initial?: string[]; onChange?: (value: string[]) => void }
  | { multiple?: false; value?: string; initial?: string; onChange?: (value: string) => void };

const searchable = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").trim();
const EDGE = 10;
const GAP = 5;

function placePanel(anchor: HTMLElement, panel: HTMLElement) {
  const rect = anchor.getBoundingClientRect();
  const viewport = window.visualViewport;
  const leftEdge = (viewport?.offsetLeft ?? 0) + EDGE;
  const rightEdge = (viewport?.offsetLeft ?? 0) + (viewport?.width ?? document.documentElement.clientWidth) - EDGE;
  const topEdge = (viewport?.offsetTop ?? 0) + EDGE;
  const bottomEdge = (viewport?.offsetTop ?? 0) + (viewport?.height ?? document.documentElement.clientHeight) - EDGE;
  const above = Math.max(0, rect.top - topEdge - GAP);
  const below = Math.max(0, bottomEdge - rect.bottom - GAP);
  const opensAbove = below < 250 && above > below;
  const width = Math.min(Math.max(rect.width, 172), rightEdge - leftEdge);
  panel.dataset.side = opensAbove ? "above" : "below";
  panel.style.left = `${Math.max(leftEdge, Math.min(rect.left, rightEdge - width))}px`;
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${Math.min(290, opensAbove ? above : below)}px`;
  panel.style.top = opensAbove ? "auto" : `${rect.bottom + GAP}px`;
  panel.style.bottom = opensAbove ? `${document.documentElement.clientHeight - rect.top + GAP}px` : "auto";
}

export function CrmPicker(props: Selection & {
  id?: string;
  label: string;
  name?: string;
  options: PickerOption[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const { id, label, name, options, placeholder = "Seleccioná una opción", disabled } = props;
  const [saved, setSaved] = useState<string[]>(() => props.multiple ? props.initial ?? [] : [props.initial ?? ""]);
  const value = props.value === undefined ? saved : props.multiple ? props.value : [props.value];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const uid = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const container = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const focusOnOpen = useRef(false);
  const selected = options.filter((option) => value.includes(option.value));
  const description = selected.map((option) => option.label).join(", ") || placeholder;
  const groups = Map.groupBy(options.filter((option) =>
    searchable(`${option.label} ${option.group ?? ""}`).includes(searchable(search))), (option) => option.group ?? "");

  function close() {
    setOpen(false);
  }

  useLayoutEffect(() => {
    if (!open) return;
    const anchor = trigger.current;
    const floating = panel.current;
    if (!anchor || !floating) return;
    const supported = typeof floating.showPopover === "function";
    function place() {
      if (anchor && floating && supported) placePanel(anchor, floating);
    }
    if (supported) {
      place();
      floating.showPopover();
    } else {
      floating.dataset.fallback = "true";
    }
    if (focusOnOpen.current) {
      floating.querySelector<HTMLElement>("[data-picker-search], [data-picker-option]")?.focus({ preventScroll: true });
      focusOnOpen.current = false;
    }
    function outsideClick(event: MouseEvent) {
      if (event.target instanceof Node && !container.current?.contains(event.target)) close();
    }
    function onScroll(event: Event) {
      if (!(event.target instanceof Node) || !floating?.contains(event.target)) place();
    }
    const observer = new ResizeObserver(place);
    observer.observe(anchor);
    document.addEventListener("click", outsideClick);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", outsideClick);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      if (supported && floating.matches(":popover-open")) floating.hidePopover();
      delete floating.dataset.fallback;
    };
  }, [open]);

  function show(focus = false) {
    focusOnOpen.current = focus;
    setSearch("");
    setOpen(true);
  }

  function select(option: string) {
    if (props.multiple) {
      const next = value.includes(option) ? value.filter((item) => item !== option) : [...value, option];
      setSaved(next);
      props.onChange?.(next);
    } else {
      setSaved([option]);
      props.onChange?.(option);
      close();
      trigger.current?.focus();
    }
  }

  return (
    <div ref={container} className="relative min-w-0" onBlur={(event) => {
      if (event.relatedTarget instanceof Node && !container.current?.contains(event.relatedTarget)) close();
    }} onKeyDown={(event) => {
      if (event.key === "Escape" && open) {
        event.preventDefault();
        event.stopPropagation();
        close();
        trigger.current?.focus();
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!open && event.target === trigger.current) {
          event.preventDefault();
          show(true);
          return;
        }
        const items = Array.from(panel.current?.querySelectorAll<HTMLElement>("[data-picker-option]") ?? []);
        if (!open || !items.length) return;
        event.preventDefault();
        const index = items.indexOf(event.target as HTMLElement);
        const step = event.key === "ArrowDown" ? 1 : -1;
        items[index < 0 ? (step === 1 ? 0 : items.length - 1) : (index + step + items.length) % items.length]?.focus();
      }
    }}>
      {name ? value.map((item) => <input key={item} type="hidden" name={name} value={item} />) : null}
      <button ref={trigger} type="button" id={id} disabled={disabled} aria-expanded={open} aria-controls={`${uid}-options`}
        aria-label={`${label}: ${description}`}
        className={cn(controlSize, "flex w-full min-w-0 items-center justify-between gap-2 rounded-lm-sm border border-lm-line-strong bg-lm-ink/5 px-3 text-left text-lm-ink transition-colors hover:bg-lm-ink/10 focus-visible:lm-focus disabled:opacity-50", open && "border-lm-signal bg-lm-signal-soft")}
        onClick={() => open ? close() : show()}>
        {selected.length === 1 && selected[0].swatch ? <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: selected[0].swatch }} /> : null}
        <span className="min-w-0 flex-1 truncate">{description}</span>
        <ChevronDown size={15} aria-hidden className={cn("shrink-0 text-lm-ink-2 motion-safe:transition-transform motion-safe:duration-150", open && "rotate-180")} />
      </button>
        <div ref={panel} popover="manual" id={`${uid}-options`} role="group" aria-label={label} inert={!open}
          className={cn(styles.panel, "lm-shadow-pop rounded-lm-md border border-lm-line-strong bg-lm-raised text-lm-ink")}>
          {options.length > 6 ? (
            <div className="relative shrink-0 border-b border-lm-line p-1.5">
              <Search aria-hidden size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-lm-ink-2" />
              <Input data-picker-search className={cn(controlSize, "pl-8")} aria-label={`Buscar en ${label}`} placeholder="Buscar…" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
          ) : null}
          <div className="min-h-0 overflow-y-auto overscroll-contain p-1.5">
            {groups.size ? Array.from(groups, ([group, rows]) => (
              <div key={group}>
                {group ? <p className="px-2 pt-2 pb-1 text-xs font-semibold text-lm-ink-2">{group}</p> : null}
                {rows.map((option) => {
                  const checked = value.includes(option.value);
                  const itemClass = cn("flex min-h-10 w-full items-center gap-2 rounded-lm-sm px-2 py-1 text-left text-sm wrap-anywhere transition-colors hover:bg-lm-ink/10 focus-within:bg-lm-ink/10 focus-visible:lm-focus sm:min-h-8", checked && "bg-lm-signal-soft");
                  return props.multiple ? (
                    <label key={option.value} className={cn(itemClass, "cursor-pointer")}>
                      <input data-picker-option type="checkbox" checked={checked} onChange={() => select(option.value)} className="size-4 shrink-0 accent-lm-signal focus-visible:lm-focus" />
                      {option.label}
                    </label>
                  ) : (
                    <button key={option.value} data-picker-option type="button" aria-pressed={checked}
                      className={itemClass}
                      onClick={() => select(option.value)}>
                      {option.swatch ? <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: option.swatch }} /> : null}
                      <span className="min-w-0 flex-1">{option.label}</span>
                      {checked ? <Check aria-hidden size={14} className="shrink-0 text-lm-signal-text" /> : null}
                    </button>
                  );
                })}
              </div>
            )) : <p className="px-2 py-1 text-sm text-lm-ink-2">Sin resultados.</p>}
          </div>
          {props.multiple ? (
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-lm-line px-2.5 py-1.5">
              <span className="min-w-0 text-xs text-lm-ink-2" aria-live="polite">{selected.length} {selected.length === 1 ? "seleccionado" : "seleccionados"}</span>
              <button type="button" className="rounded-lm-sm px-2.5 py-1.5 text-sm font-medium text-lm-signal-text hover:bg-lm-signal-soft focus-visible:lm-focus"
                onClick={() => { close(); trigger.current?.focus({ preventScroll: true }); }}>Listo</button>
            </div>
          ) : null}
        </div>
    </div>
  );
}
