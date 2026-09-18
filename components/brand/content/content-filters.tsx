import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Formulario GET sin JS, mismo patrón que components/leads/leads-filters.tsx. */
export function ContentFilters({
  basePath,
  current,
}: {
  basePath: string;
  current: { kind?: string; sort?: string; dir?: string; from?: string; to?: string };
}) {
  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-end gap-3 rounded-[20px] border border-line bg-elevated/70 p-4"
    >
      <div className="w-40">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="kind">
          Tipo
        </label>
        <Select id="kind" name="kind" defaultValue={current.kind ?? ""}>
          <option value="">Todos</option>
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-52">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="sort">
          Ordenar por
        </label>
        <Select id="sort" name="sort" defaultValue={current.sort ?? "published_at"}>
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-40">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="dir">
          Dirección
        </label>
        <Select id="dir" name="dir" defaultValue={current.dir ?? "desc"}>
          <option value="desc">Mayor a menor</option>
          <option value="asc">Menor a mayor</option>
        </Select>
      </div>

      <div className="w-36">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="from">
          Desde
        </label>
        <Input id="from" name="from" type="date" defaultValue={current.from ?? ""} />
      </div>

      <div className="w-36">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="to">
          Hasta
        </label>
        <Input id="to" name="to" type="date" defaultValue={current.to ?? ""} />
      </div>

      <Button type="submit" variant="secondary">
        Aplicar
      </Button>
    </form>
  );
}
