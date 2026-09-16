import Link from "next/link";
import { Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

/**
 * Formulario GET sin JS: cada filtro se lee de los searchParams en el Server
 * Component de /leads/lista/[id], así la paginación con `.range()` queda del
 * lado del servidor (Plan §1.3). La lista de origen ya no se filtra acá: se
 * elige antes, en la previsualización de /leads/lista.
 */
export function LeadsFilters({
  industries,
  cities,
  view,
  current,
  basePath,
}: {
  industries: Industry[];
  cities: string[];
  view: string;
  current: {
    industryId?: string;
    status?: string;
    city?: string;
    q?: string;
  };
  basePath: string;
}) {
  const hasFilters = Boolean(current.industryId || current.status || current.city || current.q);

  return (
    <form
      method="get"
      action={basePath}
      className="flex flex-wrap items-end gap-3 rounded-[20px] border border-line bg-elevated/70 p-4"
    >
      <input type="hidden" name="view" value={view} />

      <div className="min-w-[200px] flex-1">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="q">
          Buscar
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted" />
          <Input
            id="q"
            name="q"
            defaultValue={current.q}
            placeholder="Nombre, teléfono, email o dirección"
            className="pl-9"
          />
        </div>
      </div>

      <div className="w-44">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="industryId">
          Rubro
        </label>
        <Select id="industryId" name="industryId" defaultValue={current.industryId ?? ""}>
          <option value="">Todos</option>
          {industries.map((industry) => (
            <option key={industry.id} value={industry.id}>
              {industry.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-44">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="status">
          Estado
        </label>
        <Select id="status" name="status" defaultValue={current.status ?? ""}>
          <option value="">Todos</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-40">
        <label className="mb-1.5 block text-xs text-muted" htmlFor="city">
          Ciudad
        </label>
        <Select id="city" name="city" defaultValue={current.city ?? ""}>
          <option value="">Todas</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {hasFilters ? (
          <Link href={`${basePath}?view=${view}`} className="text-xs text-muted hover:text-ink">
            Limpiar filtros
          </Link>
        ) : null}
      </div>
    </form>
  );
}
