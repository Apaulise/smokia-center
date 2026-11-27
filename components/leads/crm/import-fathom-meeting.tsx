"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";

import { CrmPicker } from "@/components/leads/crm/picker";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { importFathomMeeting, loadFathomMeetings } from "@/lib/fathom/actions";
import { meetingStages, type MeetingChoice, type MeetingContext } from "@/lib/fathom/model";

const formatDate = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires",
});

export function ImportFathomMeeting({ context, imported }: { context: MeetingContext; imported: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [choices, setChoices] = useState<MeetingChoice[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const selected = choices.find((choice) => choice.id === selectedId);
  const options = choices.filter(({ id }) => !imported.includes(id)).map(({ id, title, at }) => ({
    value: id, label: `${title} · ${formatDate.format(new Date(at))}`,
  }));

  function load(cursor: string | null) {
    setError("");
    startTransition(async () => {
      try {
        const result = await loadFathomMeetings(context, cursor);
        if (!result.ok) return setError(result.message);
        setChoices((previous) => cursor
          ? [...previous, ...result.meetings.filter(({ id }) => !previous.some((choice) => choice.id === id))]
          : result.meetings);
        setNext(result.next);
      } catch {
        setError("No se pudo cargar la lista de reuniones.");
      }
    });
  }

  function save() {
    if (!selected || !stage || pending) return;
    setError("");
    startTransition(async () => {
      try {
        const result = await importFathomMeeting(context, { id: selected.id, cursor: selected.cursor, stage });
        if (!result.ok) return setError(result.message);
        setNotice(result.message);
        setOpen(false);
      } catch {
        setError("No se pudo guardar la minuta. Probá de nuevo.");
      }
    });
  }

  return (
    <>
      <Button type="button" className="min-h-11 sm:min-h-8" onClick={() => {
        setChoices([]);
        setNext(null);
        setSelectedId("");
        setStage("");
        setNotice("");
        setOpen(true);
        load(null);
      }}>
        <Download className="size-4" />
        Importar de Fathom
      </Button>
      {notice ? <span role="status" className="text-xs text-lm-success">{notice}</span> : null}
      <Dialog open={open} title="Importar minuta" description="Elegí la reunión y el tipo de llamada. La minuta será visible para quienes tengan acceso a la ficha."
        onClose={() => { if (!pending) setOpen(false); }}>
        <form method="post" className="grid gap-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
          {pending ? <p role="status" className="text-sm text-lm-ink-2">Consultando Fathom…</p> : null}
          {error ? <p role="alert" className="text-sm text-lm-danger">{error}</p> : null}
          {options.length ? (
            <CrmPicker label="Reunión de Fathom" options={options} value={selectedId} onChange={setSelectedId} disabled={pending} />
          ) : !pending && !error ? (
            <p className="text-sm text-lm-ink-2">No hay reuniones nuevas en esta página.</p>
          ) : null}
          {next ? <Button type="button" variant="ghost" disabled={pending} onClick={() => load(next)}>Ver reuniones anteriores</Button> : null}
          {error && !choices.length && !next ? (
            <Button type="button" disabled={pending} onClick={() => load(null)}>Reintentar</Button>
          ) : null}
          {options.length ? (
            <fieldset className="flex flex-wrap gap-2.5" disabled={pending}>
              <legend className="mb-2 text-sm font-medium text-lm-ink">Tipo de llamada</legend>
              {meetingStages.map(({ value, label }) => (
                <label key={value} className="flex min-h-11 items-center gap-2 rounded-lm-sm border border-lm-line px-3 text-sm text-lm-ink">
                  <input type="radio" name="stage" value={value} checked={stage === value}
                    onChange={() => setStage(value)} className="accent-lm-signal" />
                  {label}
                </label>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={pending || !selected || !stage}>Importar minuta</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
