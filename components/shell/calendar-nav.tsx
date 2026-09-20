import { ChevronLeft, ChevronRight, LayoutGrid, List, Rows3 } from "lucide-react";
import Link from "next/link";

import { ButtonLink } from "@/components/ui/button";

export type CalendarView = "mes" | "semana" | "lista";

const VIEW_OPTIONS: Array<{ value: CalendarView; label: string; icon: typeof LayoutGrid }> = [
  { value: "mes", label: "Mes", icon: LayoutGrid },
  { value: "semana", label: "Semana", icon: Rows3 },
  { value: "lista", label: "Lista", icon: List },
];

/**
 * Navegación de un calendario por período: anterior / hoy / siguiente. La usan
 * la agenda de Leads y el planificador de Marca; el estado viaja en la URL
 * (`?view=…&date=…`), así que recargar no cambia de período.
 */
export function PeriodNav({
  basePath,
  view,
  prev,
  next,
  today,
}: {
  basePath: string;
  view: CalendarView;
  prev: string;
  next: string;
  today: string;
}) {
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
}: {
  basePath: string;
  view: CalendarView;
  date: string;
  views?: CalendarView[];
}) {
  return (
    <div className="flex items-center gap-1 rounded-[12px] border border-line bg-surface/40 p-1">
      {VIEW_OPTIONS.filter((option) => views.includes(option.value)).map(({ value, label, icon: Icon }) => (
        <ButtonLink
          key={value}
          href={`${basePath}?view=${value}&date=${date}`}
          variant={view === value ? "secondary" : "ghost"}
          size="sm"
        >
          <Icon className="size-3.5" />
          {label}
        </ButtonLink>
      ))}
    </div>
  );
}
