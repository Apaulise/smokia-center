"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

import { Button } from "@/components/leads/ui/button";
import { Dialog } from "@/components/leads/ui/dialog";
import { Field, Input, Select } from "@/components/leads/ui/field";
import { createEmptyLeadList } from "@/lib/leads/actions";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

/** "Nueva lista" de `/leads/lista` (Plan §1.21): una lista manual vacía, sin scraping ni CSV, para ir cargándole leads uno por uno. */
export function CreateListDialog({ industries, onClose }: { industries: Industry[]; onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(createEmptyLeadList, null);

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <Dialog open onClose={onClose} title="Nueva lista" description="Una lista vacía, para cargarle leads a mano.">
      <form action={formAction} className="flex flex-col gap-4">
        <Field label="Nombre" htmlFor="name">
          <Input id="name" name="name" maxLength={80} required autoFocus />
        </Field>

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
            Crear
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
