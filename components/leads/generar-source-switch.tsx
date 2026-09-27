"use client";

import { AtSign, Briefcase, FileText, MapPin, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { CsvImportForm } from "@/components/leads/csv-import-form";
import { GenerarForm } from "@/components/leads/generar-form";
import { CSV_PROVIDER_META, PROVIDERS } from "@/lib/providers/registry";
import type { ApifyAccountLimits } from "@/lib/apify/client";
import type { ListPerformance } from "@/lib/leads/queries";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Industry = Database["public"]["Tables"]["industries"]["Row"];
type SourceId = "GOOGLE_MAPS" | "INSTAGRAM" | "LINKEDIN" | "CSV";

const ICON: Record<SourceId, LucideIcon> = {
  GOOGLE_MAPS: MapPin,
  INSTAGRAM: AtSign,
  LINKEDIN: Briefcase,
  CSV: FileText,
};

/**
 * Fuente (Design System §04): tarjetas seleccionables. El mock sólo contempla
 * Google Maps / CSV; acá hay tres proveedores de Apify (Maps, Instagram,
 * LinkedIn) además de CSV — se recrea el mismo patrón de tarjeta con las
 * cuatro, en vez de forzar sólo dos.
 */
export function GenerarSourceSwitch({
  industries,
  listPerformance,
  apifyCredit,
}: {
  industries: Industry[];
  listPerformance: ListPerformance[];
  apifyCredit: ApifyAccountLimits | null;
}) {
  const [sourceId, setSourceId] = useState<SourceId>((PROVIDERS[0]?.id as SourceId | undefined) ?? "CSV");
  const provider = PROVIDERS.find((p) => p.id === sourceId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PROVIDERS.map((p) => {
          const id = p.id as SourceId;
          return <SourceCard key={id} id={id} label={p.label} description={p.description} selected={sourceId === id} onSelect={() => setSourceId(id)} />;
        })}
        <SourceCard
          id={CSV_PROVIDER_META.id}
          label={CSV_PROVIDER_META.label}
          description={CSV_PROVIDER_META.description}
          selected={sourceId === "CSV"}
          onSelect={() => setSourceId("CSV")}
        />
      </div>

      {provider ? (
        <GenerarForm key={provider.id} provider={provider} industries={industries} listPerformance={listPerformance} apifyCredit={apifyCredit} />
      ) : (
        <div className="max-w-[720px]">
          <CsvImportForm industries={industries} />
        </div>
      )}
    </div>
  );
}

function SourceCard({
  id,
  label,
  description,
  selected,
  onSelect,
}: {
  id: SourceId;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = ICON[id];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex flex-col items-start gap-2 rounded-lm-lg border p-4 text-left transition-colors",
        selected ? "border-[rgb(237_235_230_/_0.4)] bg-lm-raised" : "border-lm-line bg-lm-surface hover:border-lm-line-strong",
      )}
    >
      <span className="flex items-center gap-2 font-lm-sans text-[15px] font-semibold text-lm-ink">
        <Icon className="size-4 text-lm-ink-2" strokeWidth={1.5} />
        {label}
      </span>
      <span className="text-[13px] text-lm-ink-2">{description}</span>
    </button>
  );
}
