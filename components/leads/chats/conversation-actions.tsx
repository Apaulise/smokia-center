"use client";

import { Link2, Loader2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { createLeadFromConversation, linkConversationToLead, searchLeadsForLink } from "@/lib/chats/actions";
import { STATUS_LABEL, type LeadStatus } from "@/lib/leads/status";

type Found = { id: string; name: string; status: string };

/**
 * El enlace con el lead (ver, crear, enlazar a uno existente, quitar), dentro
 * del panel del contacto. Sólo lo toca el dueño de la cuenta —los leads son de
 * cada usuario—; el socio ve el chat sin estos botones.
 */
export function LeadLink({
  conversationId,
  lead,
  canLink,
  hasHandle,
  onChanged,
}: {
  conversationId: string;
  lead: { id: string; name: string; status: string } | null;
  canLink: boolean;
  hasHandle: boolean;
  /** Pide de nuevo el hilo (y la lista) después de enlazar o crear. */
  onChanged: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Found[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function run(task: () => Promise<{ ok: boolean; message: string; leadId?: string }>, after?: (leadId?: string) => void) {
    startTransition(async () => {
      const result = await task();
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setSearching(false);
        setResults([]);
        onChanged();
        after?.(result.leadId);
      }
    });
  }

  function onSearch(value: string) {
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }
    timer.current = setTimeout(() => {
      void searchLeadsForLink(value).then(setResults);
    }, 200);
  }

  if (!lead && !canLink) {
    return <p className="text-[12.5px] text-lm-ink-3">El lead de esta conversación lo maneja tu socio.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {lead ? (
        <div className="flex items-center gap-1.5">
          <Link
            href={`/leads/${lead.id}`}
            className="inline-flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-lm-sm border border-lm-line-strong bg-lm-surface px-2.5 font-lm-sans text-[12.5px] font-medium text-lm-ink hover:bg-lm-raised focus-visible:lm-focus"
          >
            <Link2 className="size-3.5 shrink-0 text-lm-signal-text" strokeWidth={1.5} />
            <span className="truncate">{lead.name}</span>
            <span className="shrink-0 text-lm-ink-3">· {STATUS_LABEL[lead.status as LeadStatus] ?? lead.status}</span>
          </Link>
          {canLink ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => linkConversationToLead(conversationId, null))} title="Quitar el enlace con el lead" aria-label="Quitar el enlace con el lead">
              <X className="size-3.5" strokeWidth={1.5} />
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant="secondary"
            size="sm"
            disabled={pending || !hasHandle}
            title={hasHandle ? "Crear un lead con este @" : "Todavía no tenemos el @ de esta persona"}
            onClick={() => run(() => createLeadFromConversation(conversationId), (leadId) => leadId && router.push(`/leads/${leadId}`))}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" strokeWidth={1.5} />}
            Crear lead
          </Button>
          <Button variant="secondary" size="sm" disabled={pending} onClick={() => setSearching((value) => !value)} aria-expanded={searching}>
            <Link2 className="size-3.5" strokeWidth={1.5} />
            Enlazar a uno
          </Button>
        </div>
      )}

      {searching ? (
        <div className="rounded-lm-md border border-lm-line-strong bg-lm-raised p-2">
          <input
            autoFocus
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Buscar un lead por nombre"
            aria-label="Buscar un lead por nombre"
            className="h-8 w-full rounded-lm-sm border border-lm-line-strong bg-lm-surface px-2.5 font-lm-sans text-[13px] text-lm-ink placeholder:text-lm-ink-3 focus:border-lm-signal focus:outline-none"
          />
          <ul className="mt-1 max-h-48 overflow-y-auto">
            {results.map((found) => (
              <li key={found.id}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => linkConversationToLead(conversationId, found.id))}
                  className="flex w-full items-center justify-between gap-2 rounded-lm-sm px-2 py-1.5 text-left font-lm-sans text-[13px] text-lm-ink hover:bg-lm-surface focus-visible:lm-focus"
                >
                  <span className="truncate">{found.name}</span>
                  <span className="shrink-0 text-xs text-lm-ink-3">{STATUS_LABEL[found.status as LeadStatus] ?? found.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {message ? (
        <p className={message.ok ? "text-xs text-lm-success" : "text-xs text-lm-danger"} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
