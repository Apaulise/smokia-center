"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

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

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Sin storage el tema vale para esta pestaña y no se recuerda.
  }
  window.dispatchEvent(new Event(THEME_EVENT));
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
    const Icon = theme === "dark" ? Sun : Moon;
    return (
      <button
        type="button"
        onClick={() => applyTheme(next)}
        title={next === "light" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        aria-label={next === "light" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
        className={cn(
          "flex h-8 w-full cursor-pointer items-center justify-center rounded-lm-sm text-lm-ink-2 transition-colors hover:bg-lm-raised hover:text-lm-ink",
          className,
        )}
      >
        <Icon className="size-4" strokeWidth={1.5} />
      </button>
    );
  }

  return (
    <div role="radiogroup" aria-label="Tema" className={cn("flex rounded-lm-md border border-lm-line bg-lm-bg p-0.5", className)}>
      {OPTIONS.map(({ value, label, Icon }) => {
        const active = theme === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => applyTheme(value)}
            className={cn(
              "flex h-7 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lm-sm text-xs transition-colors",
              active ? "bg-lm-raised text-lm-ink" : "text-lm-ink-3 hover:text-lm-ink-2",
            )}
          >
            <Icon className="size-3.5" strokeWidth={1.5} />
            {label}
          </button>
        );
      })}
    </div>
  );
}
