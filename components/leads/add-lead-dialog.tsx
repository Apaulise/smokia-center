"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { createLeadManually } from "@/lib/leads/actions";
import type { LeadListOverviewRow } from "@/lib/leads/queries";
import { LEAD_STATUSES, STATUS_LABEL } from "@/lib/leads/status";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

const NEW_LIST_VALUE = "__new__";

/**
 * Alta manual de un lead contactado por fuera de la app (Plan §1.21) — desde
 * "+" en `/leads/lista`. No genera corrida de Apify: la lista es obligatoria
 * (existente, o una nueva creada acá mismo con sólo el nombre) porque un lead
 * sin lista no tiene ninguna pantalla que lo vuelva a mostrar después.
 */
export function AddLeadDialog({
  industries,
  lists,
  onClose,
}: {
  industries: Industry[];
  lists: LeadListOverviewRow[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createLeadManually, null);
  const [leadListId, setLeadListId] = useState(lists.length > 0 ? lists[0].id : NEW_LIST_VALUE);

  useEffect(() => {
    if (state?.ok) {
      onClose();
      router.push(`/leads/${state.leadId}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onClose={onClose} title="Agregar lead" description="Un lead contactado por fuera de la app.">
      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" maxLength={120} required autoFocus />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono (opcional)" htmlFor="phone">
            <Input id="phone" name="phone" mono placeholder="+54 9 11…" />
          </Field>
          <Field label="Email (opcional)" htmlFor="email">
            <Input id="email" name="email" type="email" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Sitio web (opcional)" htmlFor="website">
            <Input id="website" name="website" placeholder="https://…" />
          </Field>
          <Field label="Ciudad (opcional)" htmlFor="city">
            <Input id="city" name="city" />
          </Field>
        </div>

        <Field label="Rubro (opcional)" htmlFor="industryId">
          <Select id="industryId" name="industryId" defaultValue="">
            <option value="">Sin rubro</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Lista" htmlFor="leadListId">
          <Select id="leadListId" value={leadListId} onChange={(event) => setLeadListId(event.target.value)}>
            {lists.map((list) => (
              <option key={list.id} value={list.id}>
                {list.name}
              </option>
            ))}
            <option value={NEW_LIST_VALUE}>+ Crear lista nueva…</option>
          </Select>
        </Field>

        {leadListId === NEW_LIST_VALUE ? (
          <Field label="Nombre de la lista nueva" htmlFor="newListName">
            <Input id="newListName" name="newListName" maxLength={80} required autoFocus />
          </Field>
        ) : (
          <input type="hidden" name="leadListId" value={leadListId} />
        )}

        <Field label="Estado" htmlFor="status">
          <Select id="status" name="status" defaultValue="CONTACTADO">
            {LEAD_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notas (opcional)" htmlFor="notes">
          <Textarea id="notes" name="notes" maxLength={2000} placeholder="Cómo lo contactaste, qué te dijo…" />
        </Field>

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
            Agregar
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
