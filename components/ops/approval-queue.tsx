"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/leads/ui/button";
import { EmptyLine } from "@/components/leads/ui/feedback";
import { Panel } from "@/components/leads/ui/section";
import { Chip, StatusBadge } from "@/components/leads/ui/status-badge";
import { decideApproval } from "@/lib/ops/actions";
import type { OpsApprovalView } from "@/lib/ops/types";

/**
 * Aprobar, editar y saltar sólo llaman a `decideApproval`, que escribe la
 * decisión en la base. Desde acá no se envía el mensaje.
 */
export function ApprovalQueue({ items }: { items: OpsApprovalView[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<{ id: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const activeEditId = items.some((item) => item.id === editingId && item.decision === "pending") ? editingId : null;

  if (items.length === 0) {
    return (
      <EmptyLine>No hay borradores en la cola. Cuando un agente deje uno para tu OK, aparece acá.</EmptyLine>
    );
  }

  function run(id: string, action: "approve" | "skip" | "reopen", finalBody?: string) {
    setError(null);
    startTransition(async () => {
      const result = await decideApproval({ id, action, finalBody });
      if (!result.ok) {
        setError({ id, message: result.message });
        return;
      }
      setEditingId(null);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => {
        const editing = activeEditId === item.id;
        const waiting = item.decision === "pending";
        return (
          <Panel key={item.id}>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-lm-line px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                {item.leadId ? (
                  <Link href={`/leads/${item.leadId}`} className="text-[15px] font-medium text-lm-ink hover:text-lm-signal-text">
                    {item.lead}
                  </Link>
                ) : (
                  <span className="text-[15px] font-medium text-lm-ink">{item.lead}</span>
                )}
                <Chip>{item.channelLabel}</Chip>
                {item.decision === "approved" || item.decision === "edited" ? (
                  <StatusBadge group="ganado">Aprobado</StatusBadge>
                ) : item.decision === "skipped" ? (
                  <StatusBadge group="curso">Saltado</StatusBadge>
                ) : (
                  <StatusBadge group="caliente">Espera tu OK</StatusBadge>
                )}
                {item.decision === "edited" ? <Chip>Editado</Chip> : null}
              </div>
              <span className="font-mono text-[11px] text-lm-ink-3">
                {item.agent} · {item.at}
              </span>
            </div>
            <div className="flex flex-col gap-3 px-5 py-4">
              {item.why ? <p className="m-0 text-[12.5px] text-lm-ink-3">{item.why}</p> : null}
              {editing ? (
                <textarea
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  rows={4}
                  aria-label={`Mensaje para ${item.lead}`}
                  className="w-full resize-y rounded-lm-sm border border-lm-line-strong bg-lm-raised px-3 py-3 font-lm-sans text-[13.5px] leading-normal text-lm-ink outline-none focus-visible:lm-focus"
                />
              ) : (
                <p
                  className={`m-0 rounded-lm-sm bg-lm-raised px-3.5 py-3 text-[13.5px] leading-normal ${item.decision === "skipped" ? "text-lm-ink-3" : "text-lm-ink"}`}
                >
                  {item.displayBody}
                </p>
              )}
              {error?.id === item.id ? (
                <p className="m-0 text-[13px] text-lm-danger" role="alert">
                  {error.message}
                </p>
              ) : null}
              {item.decision === "approved" || item.decision === "edited" ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[13px] text-lm-success">Quedó aprobado y registrado. Desde acá no se envía el mensaje.</span>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(item.id, "reopen")}>
                    Deshacer
                  </Button>
                </div>
              ) : item.decision === "skipped" ? (
                <div className="flex justify-end">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(item.id, "reopen")}>
                    Volver a la cola
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(item.id, "skip")}>
                    Saltar
                  </Button>
                  {waiting && !editing ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => {
                        setEditingId(item.id);
                        setDraft(item.displayBody);
                        setError(null);
                      }}
                    >
                      Editar
                    </Button>
                  ) : null}
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(item.id, "approve", editing ? draft : item.displayBody)}
                  >
                    {editing ? "Aprobar versión editada" : "Aprobar"}
                  </Button>
                </div>
              )}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
