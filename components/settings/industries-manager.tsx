"use client";

import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";

import { DeleteButton } from "@/components/settings/delete-button";
import { Button } from "@/components/leads/ui/button";
import { Field, Input } from "@/components/leads/ui/field";
import { Chip } from "@/components/leads/ui/status-badge";
import type { Database } from "@/lib/supabase/database.types";
import { createIndustry, deleteIndustry, seedDefaultIndustries } from "@/lib/settings/actions";
import { cn } from "@/lib/utils";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

export function IndustriesManager({ industries }: { industries: Industry[] }) {
  const [state, formAction, pending] = useActionState(createIndustry, null);
  const [seedPending, startSeed] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <div className="flex flex-col gap-4">
      {industries.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-4 py-3">
          <p className="text-[13px] text-lm-ink-2">Todavía no cargaste ningún rubro.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={seedPending}
            onClick={() => startSeed(() => void seedDefaultIndustries())}
          >
            {seedPending ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" strokeWidth={1.5} />}
            Sembrar rubros comunes
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {industries.map((industry) => (
            <div key={industry.id} className="flex items-center gap-1 rounded-lm-sm border border-lm-line bg-lm-raised py-0.5 pr-1 pl-1">
              <Chip color={industry.color}>{industry.name}</Chip>
              <DeleteButton
                action={deleteIndustry.bind(null, industry.id)}
                confirmText={`¿Eliminar el rubro "${industry.name}"? Los leads que lo usan quedan sin rubro.`}
                label={`Eliminar ${industry.name}`}
              />
            </div>
          ))}
        </div>
      )}

      <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <Field label="Nuevo rubro" htmlFor="industry-name">
            <Input id="industry-name" name="name" placeholder="Ej: Peluquerías" required />
          </Field>
        </div>
        <Field label="Color" htmlFor="industry-color">
          <input
            id="industry-color"
            name="color"
            type="color"
            defaultValue="#F2C14E"
            className="h-9 w-14 cursor-pointer rounded-lm-sm border border-lm-line-strong bg-lm-raised p-1"
          />
        </Field>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Agregar
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
