"use client";

import { CheckCircle2, Globe, Loader2, Mail, MapPin, Phone, PhoneCall, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { logContactActivity } from "@/lib/leads/actions";
import type { LeadWithRelations } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL, type LeadActivityType, type LeadStatus } from "@/lib/leads/status";
import { buildMailtoLink, buildWhatsappLink, resolveTemplate } from "@/lib/leads/templates";
import type { Database } from "@/lib/supabase/database.types";

type Template = Database["public"]["Tables"]["message_templates"]["Row"];

const DEFAULT_MESSAGE = "Hola {{nombre}}, te escribo de Awareness AI.";

const CONTACT_LABEL: Record<"WHATSAPP" | "EMAIL" | "LLAMADA", string> = {
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  LLAMADA: "Llamada",
};

export function ContactActions({ lead, templates }: { lead: LeadWithRelations; templates: Template[] }) {
  const [dialogType, setDialogType] = useState<"WHATSAPP" | "EMAIL" | "LLAMADA" | null>(null);

  const vars = { nombre: lead.name, rubro: lead.industries?.name, ciudad: lead.city };
  const whatsappTemplate = templates.find((t) => t.channel === "WHATSAPP")?.body ?? DEFAULT_MESSAGE;
  const emailTemplate = templates.find((t) => t.channel === "EMAIL")?.body ?? DEFAULT_MESSAGE;

  function openWhatsapp() {
    if (!lead.phone) return;
    window.open(buildWhatsappLink(lead.phone, resolveTemplate(whatsappTemplate, vars)), "_blank");
    setDialogType("WHATSAPP");
  }

  function openEmail() {
    if (!lead.email) return;
    window.location.href = buildMailtoLink(
      lead.email,
      "Contacto — Awareness AI",
      resolveTemplate(emailTemplate, vars),
    );
    setDialogType("EMAIL");
  }

  const mapsUrl = lead.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.address} ${lead.city ?? ""}`)}`
    : lead.latitude && lead.longitude
      ? `https://www.google.com/maps/search/?api=1&query=${lead.latitude},${lead.longitude}`
      : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={!lead.phone} onClick={openWhatsapp}>
          <Phone className="size-3.5" />
          WhatsApp
        </Button>
        <Button type="button" variant="secondary" disabled={!lead.email} onClick={openEmail}>
          <Mail className="size-3.5" />
          Email
        </Button>
        {lead.website ? (
          <Button type="button" variant="ghost" onClick={() => window.open(lead.website!, "_blank")}>
            <Globe className="size-3.5" />
            Sitio web
          </Button>
        ) : null}
        {mapsUrl ? (
          <Button type="button" variant="ghost" onClick={() => window.open(mapsUrl, "_blank")}>
            <MapPin className="size-3.5" />
            Google Maps
          </Button>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setDialogType("LLAMADA")}>
          <PhoneCall className="size-3.5" />
          Registrar llamada
        </Button>
      </div>

      {dialogType ? (
        <ContactLogDialog
          leadId={lead.id}
          type={dialogType}
          currentStatus={lead.status}
          onClose={() => setDialogType(null)}
        />
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
    <Dialog
      open
      onClose={onClose}
      title={`Registrar ${CONTACT_LABEL[type].toLowerCase()}`}
      description="Un clic y queda en el historial del lead."
    >
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="leadId" value={leadId} />
        <input type="hidden" name="type" value={type as LeadActivityType} />

        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="content">
            Qué pasó
          </label>
          <Textarea id="content" name="content" placeholder="Ej: atendió, pidió que lo llame mañana…" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="newStatus">
              Avanzar estado
            </label>
            <Select id="newStatus" name="newStatus" defaultValue={currentStatus}>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABEL[status]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted" htmlFor="nextActionAt">
              Próxima acción
            </label>
            <input
              id="nextActionAt"
              name="nextActionAt"
              type="datetime-local"
              className="h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink"
            />
          </div>
        </div>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="size-4" />
            {state.message}
          </p>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}
            Registrar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
