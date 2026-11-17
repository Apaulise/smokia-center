"use client";

import { Moon, Sun } from "lucide-react";
import { flushSync } from "react-dom";
import { useEffect, useSyncExternalStore, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

/*
 * Tema oscuro / claro de "Señal y humo". La preferencia vive en localStorage
 * y el atributo `data-theme` de <html> lo pone, antes del primer pintado, el
 * script de THEME_INIT_SCRIPT (app/layout.tsx): sin eso la página parpadea en
 * oscuro al cargar en claro. Oscuro es el default (uso diario prolongado).
 */
export const THEME_STORAGE_KEY = "smokia:theme";
const THEME_EVENT = "smokia:theme-change";

type Theme = "dark" | "light";

/** Se inlinea en <head>. Mantenerlo mínimo y sin dependencias. */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;

function readTheme(): Theme {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function subscribeTheme(onChange: () => void) {
  window.addEventListener(THEME_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(THEME_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function commitTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin storage el tema vale para esta pestaña y no se recuerda.
  }
  // flushSync: el ícono y el resto de la UI tienen que estar listos antes de que
  // el navegador saque la foto "nueva" de la view transition.
  flushSync(() => window.dispatchEvent(new Event(THEME_EVENT)));
}

/**
 * Cambia el tema con una onda circular que nace en el botón (View Transition API).
 * Sin soporte, o con `prefers-reduced-motion`, cae a un fundido CSS de colores
 * (`html.lm-theme-fade`, globals.css) que sólo existe durante el cambio.
 */
function applyTheme(theme: Theme, origin?: HTMLElement) {
  const root = document.documentElement;
  if (readTheme() === theme) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) {
    commitTheme(theme);
    return;
  }

  if (typeof document.startViewTransition !== "function") {
    root.classList.add("lm-theme-fade");
    commitTheme(theme);
    window.setTimeout(() => root.classList.remove("lm-theme-fade"), 450);
    return;
  }

  const rect = origin?.getBoundingClientRect();
  const x = rect ? rect.left + rect.width / 2 : window.innerWidth / 2;
  const y = rect ? rect.top + rect.height / 2 : window.innerHeight / 2;
  const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

  root.classList.add("lm-theme-wave");
  const transition = document.startViewTransition(() => commitTheme(theme));
  transition.ready
    .then(() => {
      root.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 550, easing: "cubic-bezier(0.4, 0, 0.2, 1)", pseudoElement: "::view-transition-new(root)" },
      );
    })
    .catch(() => {});
  transition.finished.finally(() => root.classList.remove("lm-theme-wave"));
}

/**
 * Respaldo del script de `<head>`: cuando una página falla en el servidor,
 * React la vuelve a dibujar en el navegador y ese script no corre (de ahí el
 * aviso «Encountered a script tag»). Sin esto, la pantalla de error salía en
 * oscuro aunque se hubiera elegido el claro. Sin animación: es una corrección.
 */
export function ThemeSync() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if ((stored === "light" || stored === "dark") && document.documentElement.dataset.theme !== stored) {
        document.documentElement.dataset.theme = stored;
        window.dispatchEvent(new Event(THEME_EVENT));
      }
    } catch {
      // Sin storage queda el default.
    }
  }, []);
  return null;
}

const OPTIONS: { value: Theme; label: string; Icon: typeof Sun }[] = [
  { value: "dark", label: "Oscuro", Icon: Moon },
  { value: "light", label: "Claro", Icon: Sun },
];

/**
 * `segmented` = dos opciones lado a lado (sidebar expandida, pantalla global).
 * `icon` = un solo botón que alterna (sidebar colapsada).
 */
export function ThemeToggle({ variant = "segmented", className }: { variant?: "segmented" | "icon"; className?: string }) {
  // El snapshot de servidor es "dark": coincide con el HTML inicial; después React relee el atributo real.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "dark" as Theme);

  if (variant === "icon") {
    const next: Theme = theme === "dark" ? "light" : "dark";
    return (
      <button
        type="button"
        onClick={(e: MouseEvent<HTMLButtonElement>) => applyTheme(next, e.currentTarget)}
        title={next === "light" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        aria-label={next === "light" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className={cn(
          "mx-auto flex size-9 cursor-pointer items-center justify-center rounded-full text-lm-ink-2 transition-colors hover:bg-lm-ink/8 hover:text-lm-ink focus-visible:lm-focus",
          className,
        )}
      >
        <span className="relative size-4">
          <Sun
            className={cn(
              "absolute inset-0 size-4 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none",
              theme === "dark" ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-50 opacity-0",
            )}
            strokeWidth={1.5}
          />
          <Moon
            className={cn(
              "absolute inset-0 size-4 transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none",
              theme === "light" ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-50 opacity-0",
            )}
            strokeWidth={1.5}
          />
        </span>
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className={cn("flex gap-0.5 rounded-lm-sm bg-lm-ink/6 p-[3px]", className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={(e: MouseEvent<HTMLButtonElement>) => applyTheme(value, e.currentTarget)}
            className={cn(
              "flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] text-xs transition-colors focus-visible:lm-focus",
              active ? "bg-lm-overlay text-lm-ink shadow-[0_2px_4px_rgb(0_0_0/0.12)]" : "text-lm-ink-3 hover:text-lm-ink-2",
            )}
          >
            <Icon
              className={cn(
                "size-3.5 transition-transform duration-300 ease-out motion-reduce:transition-none",
                active ? "rotate-0 scale-100" : "-rotate-45 scale-90",
              )}
              strokeWidth={1.5}
            />
            {label}
          </button>
        );
      })}
    </div>
  );
}
