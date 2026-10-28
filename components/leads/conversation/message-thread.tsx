"use client";

import { Check, Loader2, Pencil, X } from "lucide-react";
import { useState, useTransition } from "react";

import { ResponseTypeReview } from "@/components/leads/conversation/response-type-review";
import { Button } from "@/components/leads/ui/button";
import { Textarea } from "@/components/leads/ui/field";
import { Tabs, TabButton } from "@/components/leads/ui/tabs";
import { Timeline, TimelineEvent, TimelineMessage } from "@/components/leads/ui/timeline";
import { EmptyLine } from "@/components/leads/ui/feedback";
import { ANGLE_LABEL, type SalesAngle } from "@/lib/leads/ai/angles";
import { mergeConversation, type ThreadItem } from "@/lib/leads/conversation";
import { updateLeadMessageContent } from "@/lib/leads/message-actions";
import { messageAnalysisDetails } from "@/lib/leads/message-analysis";
import type { LeadMessageRow } from "@/lib/leads/queries";
import { ACTIVITY_LABEL, STATUS_LABEL } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

type LeadActivityRow = Database["public"]["Tables"]["lead_activities"]["Row"];

const CHANNEL_LABEL: Record<Database["public"]["Enums"]["message_channel"], string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  INSTAGRAM: "Instagram",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}

type Filter = "todo" | "mensajes" | "ia";

function matchesFilter(item: ThreadItem, filter: Filter) {
  if (filter === "todo") return true;
  if (filter === "mensajes") return item.kind === "message";
  return item.kind === "message" && item.message.generated_by === "IA";
}

/**
 * El hilo central de la ficha (Plan §1.15, Design System Conversation):
 * `lead_messages` y `lead_activities` mezclados por tiempo, en la misma
 * forma de timeline (punto + línea) que el resto del sistema — no burbujas
 * de chat a izquierda/derecha. Filtros Todo/Mensajes/IA.
 */
export function MessageThread({
  messages,
  activities,
}: {
  messages: LeadMessageRow[];
  activities: Database["public"]["Tables"]["lead_activities"]["Row"][];
}) {
  const [filter, setFilter] = useState<Filter>("todo");
  const items = mergeConversation(messages, activities).filter((item) => matchesFilter(item, filter));
  const allItems = mergeConversation(messages, activities);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Actividad</span>
        <Tabs>
          <TabButton active={filter === "todo"} onClick={() => setFilter("todo")} className="text-xs">
            Todo
          </TabButton>
          <TabButton active={filter === "mensajes"} onClick={() => setFilter("mensajes")} className="text-xs">
            Mensajes
          </TabButton>
          <TabButton active={filter === "ia"} onClick={() => setFilter("ia")} className="text-xs">
            IA
          </TabButton>
        </Tabs>
      </div>

      {allItems.length === 0 ? (
        <EmptyLine>Todavía no hay actividad ni mensajes registrados.</EmptyLine>
      ) : items.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-lm-ink-3">Nada en este filtro todavía.</p>
      ) : (
        <Timeline>
          {items.map((item: ThreadItem) =>
            item.kind === "message" ? (
              <MessageRow key={`message-${item.message.id}`} message={item.message} />
            ) : (
              <ActivityRow key={`activity-${item.activity.id}`} activity={item.activity} />
            ),
          )}
        </Timeline>
      )}
    </div>
  );
}

function MessageRow({ message }: { message: LeadMessageRow }) {
  const fromLead = message.sender === "LEAD";
  const details = fromLead ? messageAnalysisDetails(message.analysis) : null;
  const [content, setContent] = useState(message.content);
  const [draft, setDraft] = useState(message.content);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function cancelEdit() {
    setDraft(content);
    setEditing(false);
    setError(null);
  }

  function saveEdit() {
    const next = draft.trim();
    if (!next) {
      setError("El mensaje no puede quedar vacío.");
      return;
    }
    if (next === content) {
      cancelEdit();
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateLeadMessageContent({ messageId: message.id, content: next });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setContent(next);
      setDraft(next);
      setEditing(false);
    });
  }

  return (
    <TimelineEvent incoming={fromLead} time={formatTime(message.occurred_at)}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-lm-ink-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span>{CHANNEL_LABEL[message.channel]}</span>
          {!fromLead && message.generated_by === "IA" ? <span className="text-lm-signal-text">IA</span> : null}
          {!fromLead && message.angle ? <span>· {ANGLE_LABEL[message.angle as SalesAngle]}</span> : null}
          {details ? <span>· interés {details.analysis.analysis.interest_level}/10</span> : null}
        </div>
        {!editing ? (
          <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 hover:text-lm-ink" aria-label="Editar mensaje">
            <Pencil className="size-3" strokeWidth={1.5} /> Editar
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-1 flex flex-col gap-2 rounded-lm-sm bg-lm-raised p-3">
          <Textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={pending} className="min-h-20" autoFocus />
          {details ? <p className="text-[11px] text-lm-ink-3">La edición corrige el registro; no vuelve a ejecutar el análisis de IA.</p> : null}
          {error ? <p className="text-xs text-lm-danger">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={pending}>
              <X className="size-3.5" /> Cancelar
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={saveEdit} disabled={pending || !draft.trim()}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} Guardar
            </Button>
          </div>
        </div>
      ) : (
        <TimelineMessage><span className="whitespace-pre-wrap">{content}</span></TimelineMessage>
      )}
      {details ? (
        <ResponseTypeReview
          messageId={message.id}
          aiResponseType={details.aiResponseType}
          value={details.effectiveResponseType}
          reviewed={Boolean(details.reviewedAt)}
          compact
        />
      ) : null}
    </TimelineEvent>
  );
}

function ActivityRow({ activity }: { activity: LeadActivityRow }) {
  return (
    <TimelineEvent time={formatTime(activity.occurred_at)} muted>
      <p className="font-medium text-lm-ink">{ACTIVITY_LABEL[activity.type]}</p>
      {activity.content ? <p className="mt-0.5 text-lm-ink-2">{activity.content}</p> : null}
      {activity.to_status ? (
        <p className="mt-0.5 text-xs text-lm-ink-3">
          {activity.from_status ? `${STATUS_LABEL[activity.from_status]} → ` : ""}
          {STATUS_LABEL[activity.to_status]}
        </p>
      ) : null}
    </TimelineEvent>
  );
}
