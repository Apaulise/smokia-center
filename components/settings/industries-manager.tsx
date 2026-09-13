"use client";

import { CheckCircle2, Loader2, Sparkles, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useTransition } from "react";

import { DeleteButton } from "@/components/settings/delete-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="space-y-4">
      {industries.length === 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-line bg-surface/60 px-4 py-3">
          <p className="text-sm text-muted">Todavía no cargaste ningún rubro.</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={seedPending}
            onClick={() => startSeed(() => void seedDefaultIndustries())}
          >
            {seedPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            Sembrar rubros comunes
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {industries.map((industry) => (
            <div
              key={industry.id}
              className="flex items-center gap-1.5 rounded-full border border-line bg-surface/40 py-0.5 pr-1 pl-1"
            >
              <Badge color={industry.color}>{industry.name}</Badge>
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
          <label htmlFor="industry-name" className="mb-1.5 block text-xs text-muted">
            Nuevo rubro
          </label>
          <Input id="industry-name" name="name" placeholder="Ej: Peluquerías" required />
        </div>
        <div>
          <label htmlFor="industry-color" className="mb-1.5 block text-xs text-muted">
            Color
          </label>
          <input
            id="industry-color"
            name="color"
            type="color"
            defaultValue="#18D6E8"
            className="h-10 w-14 cursor-pointer rounded-[12px] border border-line bg-surface/60 p-1"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Agregar
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
