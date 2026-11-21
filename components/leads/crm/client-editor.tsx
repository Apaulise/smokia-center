"use client";

import { Plus } from "lucide-react";
import { useId } from "react";
import { Field, Input, Textarea } from "@/components/ui/field";
import { CrmEditor } from "@/components/leads/crm/editor";
import { CrmPicker } from "@/components/leads/crm/picker";
import { actionSize, controlSize } from "@/components/leads/crm/styles";
import { createCrmClient, saveCrmClient, saveCrmContact } from "@/lib/crm/actions";
import { clientStatuses, clientStatusLabels, type Client, type Contact, type PersonOption } from "@/lib/crm/model";
import { ButtonLink } from "@/components/ui/button";

type Source = { id: string; name: string; email: string | null; phone: string | null };

function ContactFields({ value, optional = false }: {
  value?: { name: string; email: string | null; phone: string | null; job_title?: string | null };
  optional?: boolean;
}) {
  const id = useId();
  return (
    <div className="grid gap-3">
      <Field label={optional ? "Nombre del contacto (opcional)" : "Nombre del contacto (obligatorio)"} htmlFor={`${id}-name`}>
        <Input className={controlSize} id={`${id}-name`} name={optional ? "contact" : "name"} autoComplete="name"
          required={!optional} maxLength={160} defaultValue={value?.name} />
      </Field>
      <Field label="Cargo" htmlFor={`${id}-job-title`}>
        <Input className={controlSize} id={`${id}-job-title`} name="job_title" autoComplete="organization-title"
          maxLength={120} defaultValue={value?.job_title ?? ""} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Correo" htmlFor={`${id}-email`}>
          <Input className={controlSize} id={`${id}-email`} name="email" type="email" autoComplete="email" maxLength={254} defaultValue={value?.email ?? ""} />
        </Field>
        <Field label="Teléfono" htmlFor={`${id}-phone`}>
          <Input className={controlSize} id={`${id}-phone`} name="phone" type="tel" autoComplete="tel" maxLength={80} defaultValue={value?.phone ?? ""} />
        </Field>
      </div>
    </div>
  );
}

export function ClientEditor({ client, source, existingId, people }: { client?: Client; source?: Source; existingId?: string; people: PersonOption[] }) {
  const id = useId();
  if (existingId) return <ButtonLink className={actionSize} href={`/leads/clientes/${existingId}`}>Abrir ficha de cliente</ButtonLink>;
  const title = client ? "Editar cliente" : source ? "Crear cliente desde este lead" : "Nuevo cliente";
  const assignee = client ? people.find((person) => person.id === client.assignee_id)?.id : people[0]?.id;
  return (
    <CrmEditor title={title} description={source ? "Confirmá los datos. La ficha quedará vinculada al lead ganado." : undefined}
      trigger={client || source ? title : <><Plus size={16} aria-hidden />{title}</>}
      primary={!client && !source} action={client ? saveCrmClient.bind(null, client.id) : createCrmClient}
      submit={client ? "Guardar cambios" : "Crear cliente"}>
      {!client ? <input type="hidden" name="source" value={source?.id ?? ""} /> : null}
      <Field label="Empresa (obligatorio)" htmlFor={`${id}-name`}>
        <Input className={controlSize} id={`${id}-name`} name="name" autoComplete="organization" maxLength={160}
          defaultValue={client?.name ?? source?.name} required />
      </Field>
      <Field label="Estado" htmlFor={`${id}-status`}>
        <CrmPicker label="Estado" id={`${id}-status`} name="status" initial={client?.status ?? "onboarding"}
          options={clientStatuses.map((value) => ({ value, label: clientStatusLabels[value] }))} />
      </Field>
      <Field label="Responsable" htmlFor={`${id}-assignee`}>
        <CrmPicker label="Responsable" id={`${id}-assignee`} name="assignee_id" initial={assignee ?? ""}
          options={[{ value: "", label: "Sin responsable" }, ...people.map((person) => ({ value: person.id, label: person.label }))]} />
      </Field>
      <Field label="Notas" htmlFor={`${id}-notes`}>
        <Textarea className="text-base sm:text-sm" id={`${id}-notes`} name="notes" maxLength={5000} defaultValue={client?.notes ?? ""} />
      </Field>
      {!client ? (
        <fieldset className="rounded-lm-md border border-lm-line p-3">
          <legend className="px-1 text-sm font-medium text-lm-ink">Contacto principal</legend>
          <ContactFields optional value={source && (source.email || source.phone) ? source : undefined} />
        </fieldset>
      ) : null}
    </CrmEditor>
  );
}

export function ContactEditor({ clientId, contact }: { clientId: string; contact?: Contact }) {
  const title = contact ? "Editar contacto" : "Agregar contacto";
  return (
    <CrmEditor title={title} trigger={title} submit="Guardar contacto" action={saveCrmContact.bind(null, clientId)}>
      <input type="hidden" name="id" value={contact?.id ?? ""} />
      <ContactFields value={contact} />
    </CrmEditor>
  );
}
