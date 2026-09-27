import { ChevronLeft, ChevronRight, LayoutGrid, List, Rows3 } from "lucide-react";
import Link from "next/link";

import { ButtonLink as BrandButtonLink } from "@/components/ui/button";
import { ButtonLink as LeadsButtonLink } from "@/components/leads/ui/button";
import { cn } from "@/lib/utils";

export type CalendarView = "mes" | "semana" | "lista";
/** "brand" = Gestor de Marca Personal (tokens cyan/violeta, sin tocar); "signal" = Gestor de Leads ("Señal y humo"). */
export type CalendarVariant = "brand" | "signal";

const VIEW_OPTIONS: Array<{ value: CalendarView; label: string; icon: typeof LayoutGrid }> = [
  { value: "mes", label: "Mes", icon: LayoutGrid },
  { value: "semana", label: "Semana", icon: Rows3 },
  { value: "lista", label: "Lista", icon: List },
];

/**
 * Navegación de un calendario por período: anterior / hoy / siguiente. La usan
 * la agenda de Leads y el planificador de Marca (Plans/01 §1.5, Plans/03
 * §3.7); el estado viaja en la URL (`?view=…&date=…`), así que recargar no
 * cambia de período. `variant` sólo cambia el tema visual — cada gestor sigue
 * el suyo (CLAUDE.md §2: no se toca Marca al redisenar Leads).
 */
export function PeriodNav({
  basePath,
  view,
  prev,
  next,
  today,
  variant = "brand",
}: {
  basePath: string;
  view: CalendarView;
  prev: string;
  next: string;
  today: string;
  variant?: CalendarVariant;
}) {
  if (variant === "signal") {
    return (
      <div className="flex items-center gap-1 rounded-lm-sm border border-lm-line bg-lm-surface p-1">
        <Link
          href={`${basePath}?view=${view}&date=${prev}`}
          aria-label="Período anterior"
          className="flex size-7 items-center justify-center rounded-[3px] text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink"
        >
          <ChevronLeft className="size-4" strokeWidth={1.5} />
        </Link>
        <Link
          href={`${basePath}?view=${view}&date=${today}`}
          className="rounded-[3px] px-2.5 py-1 font-lm-sans text-[13px] text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink"
        >
          Hoy
        </Link>
        <Link
          href={`${basePath}?view=${view}&date=${next}`}
          aria-label="Período siguiente"
          className="flex size-7 items-center justify-center rounded-[3px] text-lm-ink-2 hover:bg-lm-raised hover:text-lm-ink"
        >
          <ChevronRight className="size-4" strokeWidth={1.5} />
        </Link>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      <Link
        href={`${basePath}?view=${view}&date=${prev}`}
        aria-label="Período anterior"
        className="flex size-8 items-center justify-center rounded-[10px] hover:bg-surface/60 hover:text-cyan"
      >
        <ChevronLeft className="size-4" />
      </Link>
      <Link
        href={`${basePath}?view=${view}&date=${today}`}
        className="rounded-[10px] px-2.5 py-1 text-xs text-muted hover:bg-surface/60 hover:text-ink"
      >
        Hoy
      </Link>
      <Link
        href={`${basePath}?view=${view}&date=${next}`}
        aria-label="Período siguiente"
        className="flex size-8 items-center justify-center rounded-[10px] hover:bg-surface/60 hover:text-cyan"
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

/** Selector de vista. `views` recorta las opciones: el planificador no tiene vista de lista. */
export function ViewToggle({
  basePath,
  view,
  date,
  views = ["mes", "semana", "lista"],
  variant = "brand",
}: {
  basePath: string;
  view: CalendarView;
  date: string;
  views?: CalendarView[];
  variant?: CalendarVariant;
}) {
  const options = VIEW_OPTIONS.filter((option) => views.includes(option.value));

  if (variant === "signal") {
    return (
      <div className="flex items-center gap-1 rounded-lm-sm border border-lm-line bg-lm-surface p-1">
        {options.map(({ value, label, icon: Icon }) => (
          <LeadsButtonLink
            key={value}
            href={`${basePath}?view=${value}&date=${date}`}
            variant={view === value ? "secondary" : "ghost"}
            size="sm"
            className={cn("border-transparent", view === value && "bg-lm-raised")}
          >
            <Icon className="size-3.5" strokeWidth={1.5} />
            {label}
          </LeadsButtonLink>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      {options.map(({ value, label, icon: Icon }) => (
        <BrandButtonLink
          key={value}
          href={`${basePath}?view=${value}&date=${date}`}
          variant={view === value ? "secondary" : "ghost"}
          size="sm"
        >
          <Icon className="size-3.5" />
          {label}
        </BrandButtonLink>
      ))}
    </div>
  );
}
