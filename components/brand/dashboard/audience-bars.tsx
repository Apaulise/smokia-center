import { Eyebrow, Meter } from "@/components/brand/ui/card";
import type { Database } from "@/lib/supabase/database.types";

type AudienceRow = Database["public"]["Functions"]["brand_audience_summary"]["Returns"][number];

const SECTIONS: { dimension: AudienceRow["dimension"]; label: string }[] = [
  { dimension: "EDAD", label: "Edad" },
  { dimension: "GENERO", label: "Género" },
  { dimension: "CIUDAD", label: "Ciudades" },
];

const VISIBLE_ROWS = 5;

/** Edad, género y top de ciudades (Plans/03 §3.3). El número siempre al lado de la barra. */
export function AudienceBars({ rows }: { rows: AudienceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-[12.5px] leading-[1.5] text-lm-ink-2">
        Todavía no hay demografía disponible. Instagram sólo la muestra a partir de una base mínima de seguidores.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 sm:grid-cols-3">
      {SECTIONS.map(({ dimension, label }) => {
        const section = rows.filter((r) => r.dimension === dimension).slice(0, VISIBLE_ROWS);
        const max = Math.max(1, ...section.map((r) => r.size));

        return (
          <div key={dimension} className="flex flex-col gap-3">
            <Eyebrow>{label}</Eyebrow>
            {section.length === 0 ? (
              <p className="text-[12.5px] text-lm-ink-2">Sin datos.</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {section.map((row) => (
                  <li key={row.value} className="flex flex-col gap-1.5">
                    <div className="flex gap-3 text-[12.5px]">
                      <span className="min-w-0 flex-1 truncate text-lm-ink">{row.value}</span>
                      <span className="font-mono text-lm-ink-2 tabular-nums">{row.size}</span>
                    </div>
                    <Meter percent={(row.size / max) * 100} />
                  </li>
                ))}
              </ol>
            )}
          </div>
        );
      })}
    </div>
  );
}
