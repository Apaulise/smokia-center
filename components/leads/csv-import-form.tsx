"use client";

import { CheckCircle2, Loader2, UploadCloud, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { importCsvLeads } from "@/lib/leads/actions";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

export function CsvImportForm({ industries }: { industries: Industry[] }) {
  const [state, formAction, pending] = useActionState(importCsvLeads, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="csv-name">
            Nombre de la lista
          </label>
          <Input id="csv-name" name="name" placeholder="Importación manual — Palermo" required />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="csv-file">
            Archivo CSV
          </label>
          <input
            id="csv-file"
            name="file"
            type="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-muted file:mr-3 file:cursor-pointer file:rounded-[12px] file:border file:border-line file:bg-surface/60 file:px-3 file:py-2 file:text-sm file:text-ink"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted" htmlFor="csv-industry">
            Rubro
          </label>
          <Select id="csv-industry" name="industryId" defaultValue="">
            <option value="">Sin asignar</option>
            {industries.map((industry) => (
              <option key={industry.id} value={industry.id}>
                {industry.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <p className="text-xs text-muted">
        Reconoce columnas por nombre: nombre, teléfono, email, sitio/web, dirección, ciudad, región, país. El resto se
        ignora.
      </p>
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UploadCloud className="size-3.5" />}
        Importar CSV
      </Button>
      {state ? (
        <p className={cn("flex items-center gap-1.5 text-sm", state.ok ? "text-positive" : "text-danger")}>
          {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
