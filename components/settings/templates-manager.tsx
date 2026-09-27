"use client";

import { AtSign, CheckCircle2, Loader2, Mail, MessageCircle, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { DeleteButton } from "@/components/settings/delete-button";
import { Button } from "@/components/leads/ui/button";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { createTemplate, deleteTemplate } from "@/lib/settings/actions";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type MessageTemplate = Database["public"]["Tables"]["message_templates"]["Row"];

// INSTAGRAM se agregó al enum en §1.9 (canal de lead_messages, Plan §1.15) —
// esta pantalla sólo crea plantillas de WHATSAPP/EMAIL (lib/settings/actions.ts),
// pero el tipo de la columna es el enum completo.
const CHANNEL_ICON = { WHATSAPP: MessageCircle, EMAIL: Mail, INSTAGRAM: AtSign } as const;
const CHANNEL_LABEL = { WHATSAPP: "WhatsApp", EMAIL: "Email", INSTAGRAM: "Instagram" } as const;

export function TemplatesManager({ templates }: { templates: MessageTemplate[] }) {
  const [state, formAction, pending] = useActionState(createTemplate, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      {templates.length === 0 ? (
        <p className="text-[13px] text-lm-ink-2">Todavía no cargaste ninguna plantilla.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {templates.map((template) => {
            const Icon = CHANNEL_ICON[template.channel];
            return (
              <li key={template.id} className="flex items-start justify-between gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-4 py-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[13px] text-lm-ink">
                    <Icon className="size-3.5 text-lm-ink-3" strokeWidth={1.5} />
                    <span className="font-medium">{template.name}</span>
                    <span className="text-xs text-lm-ink-3">{CHANNEL_LABEL[template.channel]}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[13px] text-lm-ink-2">{template.body}</p>
                </div>
                <DeleteButton
                  action={deleteTemplate.bind(null, template.id)}
                  confirmText={`¿Eliminar la plantilla "${template.name}"?`}
                  label={`Eliminar ${template.name}`}
                />
              </li>
            );
          })}
        </ul>
      )}

      <form ref={formRef} action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <Field label="Nombre" htmlFor="template-name">
              <Input id="template-name" name="name" placeholder="Ej: Primer contacto" required />
            </Field>
          </div>
          <div className="w-40">
            <Field label="Canal" htmlFor="template-channel">
              <Select id="template-channel" name="channel" defaultValue="WHATSAPP">
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </Select>
            </Field>
          </div>
        </div>
        <Field
          label={
            <>
              Mensaje — variables: <code className="text-lm-signal-text">{"{{nombre}}"}</code>{" "}
              <code className="text-lm-signal-text">{"{{rubro}}"}</code> <code className="text-lm-signal-text">{"{{ciudad}}"}</code>
            </>
          }
          htmlFor="template-body"
        >
          <Textarea id="template-body" name="body" placeholder="Hola {{nombre}}, te escribo de Awareness AI..." required />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending} className="w-max">
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Agregar plantilla
        </Button>
      </form>

      {state ? (
        <p className={cn("flex items-center gap-1.5 text-[13px]", state.ok ? "text-lm-success" : "text-lm-danger")}>
          {state.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
