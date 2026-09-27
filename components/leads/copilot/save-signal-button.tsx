"use client";

import { BookmarkPlus } from "lucide-react";
import { useState } from "react";

import { KnowledgeDialog } from "@/components/leads/knowledge/knowledge-dialog";
import { Button } from "@/components/leads/ui/button";
import type { KnowledgeCollection } from "@/lib/leads/knowledge/schema";
import type { LeadSignalRow } from "@/lib/leads/queries";

const KIND_TO_COLLECTION: Record<LeadSignalRow["kind"], KnowledgeCollection> = {
  DOLOR: "DOLORES",
  OBJECION: "OBJECIONES",
  SENAL_COMPRA: "APRENDIZAJES",
};

/**
 * "Guardar en memoria global" (SPA §20: "cuando aprendas algo que sirva para
 * otros leads... guardalo"). El modelo no escribe la memoria global solo acá
 * — a diferencia del chat de Marca, la prospección no tiene una conversación
 * visible donde ver qué guarda el modelo (Plan §1.15), así que esto queda
 * como una decisión humana: la nota sale prellenada de la señal confirmada,
 * pero se guarda recién cuando la persona lo confirma en el diálogo.
 */
export function SaveSignalButton({ leadId, signal }: { leadId: string; signal: LeadSignalRow }) {
  const [open, setOpen] = useState(false);

  const collection = KIND_TO_COLLECTION[signal.kind];
  const body = [signal.description, signal.evidence ? `Cita: "${signal.evidence}"` : null, signal.business_impact].filter(Boolean).join("\n\n");

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        <BookmarkPlus className="size-3.5" strokeWidth={1.5} />
        Guardar en memoria global
      </Button>
      {open ? (
        <KnowledgeDialog
          open
          note={null}
          defaultCollection={collection}
          defaultLeadId={leadId}
          prefill={{ title: signal.title, body }}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}
