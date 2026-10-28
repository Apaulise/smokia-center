"use client";

import { Search, X } from "lucide-react";

import { Input, Select } from "@/components/leads/ui/field";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

export type LeadListFilters = {
  industryId: string;
  status: LeadStatus | "";
  city: string;
  q: string;
};

/**
 * Controles locales de la lista. El padre ya tiene todos los leads cargados,
 * por lo que escribir o cambiar un filtro no navega ni consulta el servidor.
 */
export function LeadsFilters({
  industries,
  cities,
  value,
  onChange,
}: {
  industries: Industry[];
  cities: string[];
  value: LeadListFilters;
  onChange: (filters: LeadListFilters) => void;
}) {
  const hasFilters = Boolean(value.industryId || value.status || value.city || value.q);

  function update(changes: Partial<LeadListFilters>) {
    onChange({ ...value, ...changes });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lm-lg border border-lm-line bg-lm-surface p-4">
      <div className="min-w-[200px] flex-1">
        <label className="mb-1.5 block text-xs text-lm-ink-2" htmlFor="q">
          Buscar
        </label>
        <div className="relative">
          <Search className="absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-lm-ink-3" strokeWidth={1.5} />
          <Input
            id="q"
            name="q"
            value={value.q}
            onChange={(event) => update({ q: event.target.value })}
            placeholder="Nombre, teléfono, email o dirección"
            className="pr-9 pl-9"
            autoComplete="off"
          />
          {value.q ? (
            <button
              type="button"
              onClick={() => update({ q: "" })}
              className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-lm-xs p-1 text-lm-ink-3 hover:text-lm-ink"
              aria-label="Limpiar búsqueda"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          ) : null}
        </div>
      </div>

      <div className="w-44">
        <label className="mb-1.5 block text-xs text-lm-ink-2" htmlFor="industryId">
          Rubro
        </label>
        <Select id="industryId" name="industryId" value={value.industryId} onChange={(event) => update({ industryId: event.target.value })}>
          <option value="">Todos</option>
          {industries.map((industry) => (
            <option key={industry.id} value={industry.id}>
              {industry.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-44">
        <label className="mb-1.5 block text-xs text-lm-ink-2" htmlFor="status">
          Estado
        </label>
        <Select id="status" name="status" value={value.status} onChange={(event) => update({ status: event.target.value as LeadStatus | "" })}>
          <option value="">Todos</option>
          {LEAD_STATUSES.map((status) => (
            <option key={status} value={status}>
              {STATUS_LABEL[status]}
            </option>
          ))}
        </Select>
      </div>

      <div className="w-40">
        <label className="mb-1.5 block text-xs text-lm-ink-2" htmlFor="city">
          Ciudad
        </label>
        <Select id="city" name="city" value={value.city} onChange={(event) => update({ city: event.target.value })}>
          <option value="">Todas</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex min-w-28 items-center justify-end pb-2 text-xs text-lm-ink-3">
        {hasFilters ? (
          <button type="button" onClick={() => onChange({ industryId: "", status: "", city: "", q: "" })} className="hover:text-lm-ink">
            Limpiar filtros
          </button>
        ) : (
          <span>Filtros instantáneos</span>
        )}
      </div>
    </div>
  );
}
