import { AlertTriangle, HelpCircle, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";

import { Markdown } from "@/components/brand/markdown";
import { Card, CardHeader, Eyebrow } from "@/components/brand/ui/card";
import type { Database } from "@/lib/supabase/database.types";

type AnalysisNote = Database["public"]["Tables"]["brand_analysis_notes"]["Row"];

/**
 * SOC §29: la lectura del análisis completo (qué sabemos / sospechamos / no
 * sabemos todavía), separada de las recomendaciones puntuales. Una sola card
 * con tres columnas divididas por línea. El modelo escribe en viñetas
 * (Plans/03 §3.10): cada ítem se lee como un párrafo con borde izquierdo, sin
 * viñeta.
 */
export function AnalysisNoteCard({ note }: { note: AnalysisNote }) {
  return (
    <Card>
      <CardHeader title="Lectura del análisis" description="Qué sabemos, qué sospechamos y qué falta todavía." />
      <div className="grid grid-cols-1 divide-lm-line sm:grid-cols-3 sm:divide-x">
        <Column icon={<Lightbulb className="size-[13px]" />} label="Qué sabemos" text={note.knowns} />
        <Column icon={<HelpCircle className="size-[13px]" />} label="Qué sospechamos" text={note.hypotheses} />
        <Column icon={<AlertTriangle className="size-[13px]" />} label="Qué no sabemos todavía" text={note.unknowns} />
      </div>
    </Card>
  );
}

function Column({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div className="flex flex-col gap-3 px-5 pt-[18px] pb-5">
      <div className="flex items-center gap-2 text-lm-ink-3">
        {icon}
        <Eyebrow>{label}</Eyebrow>
      </div>
      <Markdown className="text-[12.5px] leading-[1.55] text-lm-smoke-5 [&_li]:border-l [&_li]:border-lm-line-strong [&_li]:pl-3 [&_ul]:list-none [&_ul]:space-y-3 [&_ul]:pl-0">
        {text}
      </Markdown>
    </div>
  );
}
