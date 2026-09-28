import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/leads/ui/button";
import { Input, Select } from "@/components/leads/ui/field";
import type { ContentSortField } from "@/lib/brand/queries";
import type { Database } from "@/lib/supabase/database.types";

type PostKind = Database["public"]["Enums"]["brand_post_kind"];

const KIND_OPTIONS: { value: PostKind; label: string }[] = [
  { value: "REEL", label: "Reel" },
  { value: "POST", label: "Post" },
  { value: "CARRUSEL", label: "Carrusel" },
  { value: "HISTORIA", label: "Historia" },
  { value: "VIDEO", label: "Video" },
  { value: "SHORT", label: "Short" },
];

const SORT_OPTIONS: { value: ContentSortField; label: string }[] = [
  { value: "published_at", label: "Fecha de publicación" },
  { value: "views", label: "Views" },
  { value: "reel_avg_watch_time_ms", label: "Watch time promedio" },
  { value: "reel_skip_rate", label: "Skip rate" },
  { value: "saved", label: "Guardados" },
  { value: "shares", label: "Compartidos" },
  { value: "new_followers", label: "Seguidores ganados" },
];

function Filter({ label, htmlFor, width, children }: { label: string; htmlFor: string; width: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5 text-[11.5px] text-lm-ink-3" style={{ width }}>
      {label}
      {children}
    </label>
  );
}

/** Un `<select>` nativo con la flecha del sistema en vez de la del navegador. */
function FilterSelect({ children, ...props }: React.ComponentProps<typeof Select>) {
  return (
    <div className="relative">
      <Select {...props} className="h-[34px] appearance-none pr-8 text-[12.5px]">
        {children}
      </Select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-[13px] -translate-y-1/2 text-lm-ink-3" />
    </div>
  );
}

/**
 * Formulario GET sin JS, mismo patrón que components/leads/leads-filters.tsx.
 * `median` es la mediana de views de los reels, para leer las cards contra algo.
 */
export function ContentFilters({
  basePath,
  current,
  median,
}: {
  basePath: string;
  current: { kind?: string; sort?: string; dir?: string; from?: string; to?: string };
  median?: string | null;
}) {
  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-end gap-2.5 border-b border-lm-line pb-5"
    >
      <Filter label="Tipo" htmlFor="kind" width="160px">
        <FilterSelect id="kind" name="kind" defaultValue={current.kind ?? ""}>
          <option value="">Todos</option>
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>
      </Filter>

      <Filter label="Ordenar por" htmlFor="sort" width="210px">
        <FilterSelect id="sort" name="sort" defaultValue={current.sort ?? "published_at"}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </FilterSelect>
      </Filter>

      <Filter label="Dirección" htmlFor="dir" width="160px">
        <FilterSelect id="dir" name="dir" defaultValue={current.dir ?? "desc"}>
          <option value="desc">Mayor a menor</option>
          <option value="asc">Menor a mayor</option>
        </FilterSelect>
      </Filter>

      <Filter label="Desde" htmlFor="from" width="150px">
        <Input id="from" name="from" type="date" mono defaultValue={current.from ?? ""} className="h-[34px] text-[12.5px]" />
      </Filter>

      <Filter label="Hasta" htmlFor="to" width="150px">
        <Input id="to" name="to" type="date" mono defaultValue={current.to ?? ""} className="h-[34px] text-[12.5px]" />
      </Filter>

      <Button type="submit" className="h-[34px] px-3.5 text-[12.5px]">
        Aplicar
      </Button>

      <span className="flex-1" />
      {median ? (
        <span className="pb-[9px] text-xs text-lm-ink-3">
          Mediana de referencia: <span className="font-mono text-lm-ink">{median}</span>
        </span>
      ) : null}
    </form>
  );
}
