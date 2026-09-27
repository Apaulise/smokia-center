"use client";

import { CalendarArrowDown, Loader2 } from "lucide-react";
import { useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { exportAgendaIcs } from "@/lib/leads/actions";

function downloadIcs(ics: string, filename: string) {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Descarga los próximos turnos como .ics para importar al calendario del celular (Plan §1.5). */
export function IcsExportButton() {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await exportAgendaIcs();
      if (result.ok) downloadIcs(result.ics, result.filename);
    });
  }

  return (
    <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={handleClick}>
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CalendarArrowDown className="size-3.5" strokeWidth={1.5} />}
      Exportar .ics
    </Button>
  );
}
