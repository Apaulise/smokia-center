import { AlertTriangle, HelpCircle, Lightbulb } from "lucide-react";
import type { ReactNode } from "react";

import { Markdown } from "@/components/brand/markdown";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import type { Database } from "@/lib/supabase/database.types";

type AnalysisNote = Database["public"]["Tables"]["brand_analysis_notes"]["Row"];

/**
 * SOC §29: la lectura del análisis completo (qué sabemos / sospechamos / no
 * sabemos todavía), separada de las recomendaciones puntuales. Una sola card
 * con tres secciones cortas en vez de tres cards — el modelo ya escribe en
 * viñetas (Plans/03 §3.10), acá sólo se les da lugar para leerse rápido.
 */
export function AnalysisNoteCard({ note }: { note: AnalysisNote }) {
  return (
    <Card>
      <CardHeader title="Lectura del análisis" description="Qué sabemos, qué sospechamos y qué falta todavía." />
      <CardBody className="grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Section icon={<Lightbulb className="size-3.5" />} label="Qué sabemos" text={note.knowns} />
        <Section icon={<HelpCircle className="size-3.5" />} label="Qué sospechamos" text={note.hypotheses} />
        <Section icon={<AlertTriangle className="size-3.5" />} label="Qué no sabemos todavía" text={note.unknowns} />
      </CardBody>
    </Card>
  );
}

function Section({ icon, label, text }: { icon: ReactNode; label: string; text: string }) {
  return (
    <div>
      <h4 className="mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide text-muted uppercase">
        {icon}
        {label}
      </h4>
      <Markdown className="text-xs leading-relaxed">{text}</Markdown>
    </div>
  );
}
