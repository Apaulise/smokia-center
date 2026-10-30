"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Select, Textarea } from "@/components/leads/ui/field";
import { Panel } from "@/components/leads/ui/section";
import { StatusBadge } from "@/components/leads/ui/status-badge";
import { updateWeeklyReview } from "@/lib/weekly/actions";
import { WEEKLY_STATUS_GROUP, WEEKLY_STATUS_LABEL } from "@/lib/weekly/labels";
import { WEEKLY_CHANGE_STATUSES, type WeeklyChange, type WeeklyChangeStatus } from "@/lib/weekly/types";

export function ConclusionReview({
  reportId,
  text,
  status,
  result,
}: {
  reportId: string;
  text: string;
  status: WeeklyChangeStatus;
  result: string | null;
}) {
  return (
    <Panel>
      <div className="flex flex-col gap-4 px-5 py-4">
        {text ? (
          <p className="m-0 text-[14px] leading-relaxed whitespace-pre-wrap text-lm-ink">{text}</p>
        ) : (
          <p className="m-0 text-[13px] text-lm-ink-3">El agente no escribió conclusiones esta semana.</p>
        )}
        <DecisionForm
          reportId={reportId}
          target="conclusion"
          status={status}
          result={result}
          statusLabel="Estado de la conclusión"
          resultLabel="Resultado"
        />
      </div>
    </Panel>
  );
}

export function ChangeList({ reportId, changes }: { reportId: string; changes: WeeklyChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {changes.map((change) => (
        <Panel key={change.key}>
          <div className="flex flex-col gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="m-0 text-[15px] font-medium text-lm-ink">{change.title}</h3>
              <StatusBadge group={WEEKLY_STATUS_GROUP[change.status]}>{WEEKLY_STATUS_LABEL[change.status]}</StatusBadge>
            </div>
            {change.detail ? <p className="m-0 text-[13.5px] leading-relaxed text-lm-ink-2">{change.detail}</p> : null}
            <DecisionForm
              reportId={reportId}
              target="change"
              changeKey={change.key}
              status={change.status}
              result={change.result}
              statusLabel={`Estado de ${change.title}`}
              resultLabel="Resultado"
            />
          </div>
        </Panel>
      ))}
    </div>
  );
}

function DecisionForm({
  reportId,
  target,
  changeKey,
  status,
  result,
  statusLabel,
  resultLabel,
}: {
  reportId: string;
  target: "conclusion" | "change";
  changeKey?: string;
  status: WeeklyChangeStatus;
  result: string | null;
  statusLabel: string;
  resultLabel: string;
}) {
  const [nextStatus, setNextStatus] = useState(status);
  const [nextResult, setNextResult] = useState(result ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = nextStatus !== status || nextResult.trim() !== (result ?? "");

  function save() {
    setError(null);
    startTransition(async () => {
      const response = await updateWeeklyReview({
        id: reportId,
        target,
        changeKey,
        status: nextStatus,
        result: nextResult,
      });
      if (!response.ok) setError(response.message);
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-lm-line pt-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Estado" className="sm:w-44">
          <Select aria-label={statusLabel} value={nextStatus} disabled={pending} onChange={(event) => setNextStatus(event.target.value as WeeklyChangeStatus)}>
            {WEEKLY_CHANGE_STATUSES.map((item) => (
              <option key={item} value={item}>
                {WEEKLY_STATUS_LABEL[item]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={resultLabel} hint="Qué se vio después. Vacío si todavía no hay resultado." className="min-w-0 flex-1">
          <Textarea
            aria-label={resultLabel}
            value={nextResult}
            rows={2}
            disabled={pending}
            placeholder="Qué pasó al probarlo"
            onChange={(event) => setNextResult(event.target.value)}
          />
        </Field>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={pending || !dirty} onClick={save}>
          {pending ? "Guardando…" : "Guardar estado"}
        </Button>
        {error ? (
          <p className="m-0 text-[13px] text-lm-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
