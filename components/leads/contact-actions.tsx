"use client";

import { CheckCircle2, Globe, Loader2, Mail, MapPin, Phone, PhoneCall, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { logContactActivity } from "@/lib/leads/actions";
import type { LeadWithRelations } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL, type LeadActivityType, type LeadStatus } from "@/lib/leads/status";
import { buildMailtoLink, buildWhatsappLink } from "@/lib/leads/templates";

const CONTACT_LABEL: Record<"WHATSAPP" | "EMAIL" | "LLAMADA", string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  LLAMADA: "Llamada",
};

/**
 * Acciones rápidas del header del lead (Design System §07): 32px, secundarias.
 *
 * WhatsApp/Email acá abren con un saludo genérico fijo, sólo para tener el
 * chat/mail a mano — el mensaje de verdad (apertura, seguimiento, respuesta)
 * se redacta con el copiloto en `LeadComposer` y se manda desde ahí, con su
 * propio botón "Abrir WhatsApp" ya con el texto redactado.
 */
export function ContactActions({ lead }: { lead: LeadWithRelations }) {
  const [dialogType, setDialogType] = useState<"WHATSAPP" | "EMAIL" | "LLAMADA" | null>(null);

  const defaultMessage = `Hola ${lead.name}, te escribo de Awareness AI.`;

  function openWhatsapp() {
    if (!lead.phone) return;
    window.open(buildWhatsappLink(lead.phone, defaultMessage), "_blank");
    setDialogType("WHATSAPP");
  }

  function openEmail() {
    if (!lead.email) return;
    window.location.href = buildMailtoLink(lead.email, "Contacto — Awareness AI", defaultMessage);
    setDialogType("EMAIL");
  }

  const mapsUrl = lead.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.address} ${lead.city ?? ""}`)}`
    : lead.latitude && lead.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="secondary" disabled={!lead.phone} onClick={openWhatsapp}>
        <Phone className="size-3.5" strokeWidth={1.5} />
        WhatsApp
      </Button>
      <Button type="button" variant="secondary" disabled={!lead.email} onClick={openEmail}>
        <Mail className="size-3.5" strokeWidth={1.5} />
        Email
      </Button>
      <Button type="button" variant="secondary" onClick={() => setDialogType("LLAMADA")}>
        <PhoneCall className="size-3.5" strokeWidth={1.5} />
        Llamada
      </Button>
      {lead.website ? (
        <Button type="button" variant="ghost" onClick={() => window.open(lead.website!, "_blank")}>
          <Globe className="size-3.5" strokeWidth={1.5} />
          Sitio web
        </Button>
      ) : null}
      {mapsUrl ? (
        <Button type="button" variant="ghost" onClick={() => window.open(mapsUrl, "_blank")}>
          <MapPin className="size-3.5" strokeWidth={1.5} />
          Maps
        </Button>
      ) : null}

      {dialogType ? (
        <ContactLogDialog leadId={lead.id} type={dialogType} currentStatus={lead.status} onClose={() => setDialogType(null)} />
      ) : null}
    </div>
  );
}

function ContactLogDialog({
  leadId,
  type,
  currentStatus,
  onClose,
}: {
  leadId: string;
  type: "WHATSAPP" | "EMAIL" | "LLAMADA";
  currentStatus: LeadStatus;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(logContactActivity, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onClose={onClose} title={`Registrar ${CONTACT_LABEL[type].toLowerCase()}`} description="Un clic y queda en el historial del lead.">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="type" value={type as LeadActivityType} />

        <Field label="Qué pasó" htmlFor="content">
          <Textarea id="content" name="content" placeholder="Ej: atendió, pidió que lo llame mañana…" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Avanzar estado" htmlFor="newStatus">
            <Select id="newStatus" name="newStatus" defaultValue={currentStatus}>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Próxima acción" htmlFor="nextActionAt">
            <Input id="nextActionAt" name="nextActionAt" type="datetime-local" mono />
          </Field>
        </div>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
            <XCircle className="size-4" strokeWidth={1.5} />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-lm-line pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" strokeWidth={1.5} />}
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
