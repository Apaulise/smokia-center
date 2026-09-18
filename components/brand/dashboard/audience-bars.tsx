import type { Database } from "@/lib/supabase/database.types";

type AudienceRow = Database["public"]["Functions"]["brand_audience_summary"]["Returns"][number];

const SECTIONS: { dimension: AudienceRow["dimension"]; label: string }[] = [
  { dimension: "EDAD", label: "Edad" },
  { dimension: "GENERO", label: "Género" },
  { dimension: "CIUDAD", label: "Ciudades" },
];

const VISIBLE_ROWS = 5;
// Una sola serie de "resultado" (manual §9): son listas rankeadas por
// magnitud, no identidades categóricas — no hace falta un color por barra.
const BAR_COLOR = "#18D6E8";

/** Edad, género y top de ciudades (Plans/03 §3.3). El número siempre al lado de la barra. */
export function AudienceBars({ rows }: { rows: AudienceRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        Todavía no hay demografía disponible. Instagram sólo la muestra a partir de una base mínima de seguidores.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
      {SECTIONS.map(({ dimension, label }) => {
        const section = rows.filter((r) => r.dimension === dimension).slice(0, VISIBLE_ROWS);
        const max = Math.max(1, ...section.map((r) => r.size));

        return (
          <div key={dimension}>
            <h4 className="mb-3 text-xs font-medium tracking-wide text-muted uppercase">{label}</h4>
            {section.length === 0 ? (
              <p className="text-sm text-muted">Sin datos.</p>
            ) : (
              <ol className="space-y-3">
                {section.map((row) => (
                  <li key={row.value} className="group space-y-1.5">
                    <div className="flex items-baseline justify-between text-sm">
                      <span className="text-ink">{row.value}</span>
                      <span className="tabular text-muted">{row.size}</span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface/60">
                      <div
                        className="h-full rounded-full transition-[filter] duration-150 group-hover:brightness-125"
                        style={{ width: `${(row.size / max) * 100}%`, backgroundColor: BAR_COLOR }}
                      />
                    </div>
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
