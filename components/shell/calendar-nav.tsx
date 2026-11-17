import { ChevronLeft, ChevronRight, LayoutGrid, List, Rows3 } from "lucide-react";
import Link from "next/link";

import { Segmented, SegmentedLink } from "@/components/ui/tabs";

export type CalendarView = "mes" | "semana" | "lista";

const VIEW_OPTIONS: Array<{ value: CalendarView; label: string; icon: typeof LayoutGrid }> = [
  { value: "mes", label: "Mes", icon: LayoutGrid },
  { value: "semana", label: "Semana", icon: Rows3 },
  { value: "lista", label: "Lista", icon: List },
];

function calendarHref(basePath: string, values: Record<string, string>, extraParams?: Record<string, string | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(extraParams ?? {})) if (value) params.set(key, value);
  for (const [key, value] of Object.entries(values)) params.set(key, value);
  return `${basePath}?${params.toString()}`;
}

const STEP =
  "flex size-7 items-center justify-center rounded-[6px] text-lm-ink-2 transition-colors duration-150 ease-out hover:bg-lm-ink/8 hover:text-lm-ink focus-visible:lm-focus";

/**
 * Navegación de un calendario por período: anterior / hoy / siguiente. La usan
 * la agenda de Leads y el planificador de Marca (Plans/01 §1.5, Plans/03
 * §3.7); el estado viaja en la URL (`?view=…&date=…`), así que recargar no
 * cambia de período.
 */
export function PeriodNav({
  basePath,
  view,
  prev,
  next,
  today,
  extraParams,
}: {
  basePath: string;
  view: CalendarView;
  prev: string;
  next: string;
  today: string;
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <Segmented className="items-center">
      <Link href={calendarHref(basePath, { view, date: prev }, extraParams)} aria-label="Período anterior" className={STEP}>
        <ChevronLeft className="size-4" strokeWidth={1.5} />
      </Link>
      <Link
        href={calendarHref(basePath, { view, date: today }, extraParams)}
        className="flex h-7 items-center rounded-[6px] px-2.5 font-lm-sans text-[13px] font-medium text-lm-ink-2 transition-colors duration-150 ease-out hover:bg-lm-ink/8 hover:text-lm-ink focus-visible:lm-focus"
      >
        Hoy
      </Link>
      <Link href={calendarHref(basePath, { view, date: next }, extraParams)} aria-label="Período siguiente" className={STEP}>
        <ChevronRight className="size-4" strokeWidth={1.5} />
      </Link>
    </Segmented>
  );
}

/** Selector de vista. `views` recorta las opciones: el planificador no tiene vista de lista. */
export function ViewToggle({
  basePath,
  view,
  date,
  views = ["mes", "semana", "lista"],
  extraParams,
}: {
  basePath: string;
  view: CalendarView;
  date: string;
  views?: CalendarView[];
  extraParams?: Record<string, string | undefined>;
}) {
  return (
    <Segmented>
      {VIEW_OPTIONS.filter((option) => views.includes(option.value)).map(({ value, label, icon: Icon }) => (
        <SegmentedLink key={value} href={calendarHref(basePath, { view: value, date }, extraParams)} active={view === value} className="gap-1.5">
          <Icon className="size-3.5" strokeWidth={1.5} />
          {label}
        </SegmentedLink>
      ))}
    </Segmented>
  );
}
