"use client";

import { CheckCircle2, Loader2, Mail, MessageCircle, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { DeleteButton } from "@/components/settings/delete-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createTemplate, deleteTemplate } from "@/lib/settings/actions";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type MessageTemplate = Database["public"]["Tables"]["message_templates"]["Row"];

const CHANNEL_ICON = { WHATSAPP: MessageCircle, EMAIL: Mail } as const;
const CHANNEL_LABEL = { WHATSAPP: "WhatsApp", EMAIL: "Email" } as const;

export function TemplatesManager({ templates }: { templates: MessageTemplate[] }) {
  const [state, formAction, pending] = useActionState(createTemplate, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="space-y-4">
      {templates.length === 0 ? (
        <p className="text-sm text-muted">Todavía no cargaste ninguna plantilla.</p>
      ) : (
        <ul className="space-y-2">
          {templates.map((template) => {
            const Icon = CHANNEL_ICON[template.channel];
            return (
              <li
                key={template.id}
                className="flex items-start justify-between gap-3 rounded-[12px] border border-line bg-surface/40 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm text-ink">
                    <Icon className="size-3.5 text-muted" />
                    <span className="font-medium">{template.name}</span>
                    <span className="text-xs text-muted">{CHANNEL_LABEL[template.channel]}</span>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{template.body}</p>
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

      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[200px] flex-1">
            <label htmlFor="template-name" className="mb-1.5 block text-xs text-muted">
              Nombre
            </label>
            <Input id="template-name" name="name" placeholder="Ej: Primer contacto" required />
          </div>
          <div className="w-40">
            <label htmlFor="template-channel" className="mb-1.5 block text-xs text-muted">
              Canal
            </label>
            <Select id="template-channel" name="channel" defaultValue="WHATSAPP">
              <option value="WHATSAPP">WhatsApp</option>
              <option value="EMAIL">Email</option>
            </Select>
          </div>
        </div>
        <div>
          <label htmlFor="template-body" className="mb-1.5 block text-xs text-muted">
            Mensaje — variables: <code className="text-cyan">{"{{nombre}}"}</code>{" "}
            <code className="text-cyan">{"{{rubro}}"}</code>{" "}
            <code className="text-cyan">{"{{ciudad}}"}</code>
          </label>
          <Textarea
            id="template-body"
            name="body"
            placeholder="Hola {{nombre}}, te escribo de Awareness AI..."
            required
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Agregar plantilla
        </Button>
      </form>

      {state ? (
        <p
          className={cn(
            "flex items-center gap-1.5 text-sm",
            state.ok ? "text-positive" : "text-danger",
          )}
        >
          {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
