"use client";

import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Input, Select } from "@/components/leads/ui/field";
import { importCsvLeads } from "@/lib/leads/actions";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

/**
 * Red de seguridad cuando Apify falla o no hay crédito. Sin costo ni API. El
 * mapeo columna→campo con % de completitud del mock (§04.B) no existe todavía
 * en el backend: hoy el import reconoce columnas por nombre server-side, sin
 * vista previa — se mantiene esa lógica, sólo se redibuja.
 */
export function CsvImportForm({ industries }: { industries: Industry[] }) {
  const [state, formAction, pending] = useActionState(importCsvLeads, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la lista" htmlFor="csv-name">
          <Input id="csv-name" name="name" placeholder="Importación manual — Palermo" required />
        </Field>
        <Field label="Archivo CSV" htmlFor="csv-file">
          <input
            id="csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-[13px] text-lm-ink-2 file:mr-3 file:cursor-pointer file:rounded-lm-sm file:border file:border-lm-line-strong file:bg-lm-raised file:px-3 file:py-1.5 file:text-[13px] file:text-lm-ink"
          />
        </Field>
        <Field label="Rubro a asignar" htmlFor="csv-industry">
          <Select id="csv-industry" name="industryId" defaultValue="">
            <option value="">Sin asignar</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <p className="text-xs text-lm-ink-3">
        Reconoce columnas por nombre: nombre, teléfono, email, sitio/web, dirección, ciudad, región, país. El resto se ignora.
      </p>
      <Button type="submit" variant="secondary" disabled={pending} className="w-max">
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" strokeWidth={1.5} />}
        Importar CSV
      </Button>
      {state ? (
        <p className={cn("flex items-center gap-1.5 text-[13px]", state.ok ? "text-lm-success" : "text-lm-danger")}>
          {state.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
