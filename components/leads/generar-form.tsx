"use client";

import { Loader2, XCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { generateLeadList } from "@/lib/leads/actions";
import { PROVIDERS } from "@/lib/providers/registry";
import type { AnyLeadSourceProvider } from "@/lib/providers/types";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

function defaultsFor(provider: AnyLeadSourceProvider): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const field of provider.fields) {
    if (field.defaultValue !== undefined) defaults[field.name] = String(field.defaultValue);
  }
  return defaults;
}

/**
 * PROVIDERS se importa directo del módulo, no llega por props: los
 * proveedores traen ZodType y funciones, y un Server Component no puede
 * pasarle eso a un Client Component (no es serializable por el borde RSC).
 */
export function GenerarForm({ industries }: { industries: Industry[] }) {
  const providers: AnyLeadSourceProvider[] = PROVIDERS;
  const router = useRouter();
  const pathname = usePathname();
  const [sourceId, setSourceId] = useState(providers[0]?.id ?? "");
  const provider = providers.find((p) => p.id === sourceId) ?? providers[0];
  const [criteria, setCriteria] = useState<Record<string, string>>(() => (provider ? defaultsFor(provider) : {}));
  const [state, formAction, pending] = useActionState(generateLeadList, null);

  useEffect(() => {
    if (state?.ok) router.replace(`${pathname}?job=${state.jobId}`, { scroll: false });
  }, [state, router, pathname]);

  const estimatedCost = useMemo(() => {
    if (!provider) return null;
    const parsed = provider.criteriaSchema.safeParse(criteria);
    if (!parsed.success) return null;
    try {
      return provider.estimateCost(parsed.data);
    } catch {
      return null;
    }
  }, [provider, criteria]);

  if (!provider) return null;

  function handleSourceChange(event: ChangeEvent<HTMLSelectElement>) {
    const next = providers.find((p) => p.id === event.target.value);
    if (!next) return;
    setSourceId(next.id);
    setCriteria(defaultsFor(next));
  }

  function handleFieldChange(name: string, value: string) {
    setCriteria((current) => ({ ...current, [name]: value }));
  }

  return (
    <Card>
      <CardHeader title="Generar lista" description={provider.description} />
      <CardBody className="space-y-4">
        <form action={formAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-xs text-muted" htmlFor="source">
                Fuente
              </label>
              <Select id="source" name="source" value={sourceId} onChange={handleSourceChange}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted" htmlFor="name">
                Nombre de la lista
              </label>
              <Input id="name" name="name" placeholder={`${provider.label} — nueva búsqueda`} required />
            </div>
            <div>
              <label className="mb-1.5 block text-xs text-muted" htmlFor="industryId">
                Rubro
              </label>
              <Select id="industryId" name="industryId" defaultValue="">
                <option value="">Sin asignar</option>
                {industries.map((industry) => (
                  <option key={industry.id} value={industry.id}>
                    {industry.name}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-muted">Se asigna solo a cada lead que traiga esta lista.</p>
            </div>
          </div>

          {provider.fields.map((field) => (
            <div key={field.name}>
              <label className="mb-1.5 block text-xs text-muted" htmlFor={field.name}>
                {field.label}
              </label>
              {field.type === "textarea" ? (
                <Textarea
                  id={field.name}
                  name={field.name}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={criteria[field.name] ?? ""}
                  onChange={(event) => handleFieldChange(field.name, event.target.value)}
                />
              ) : (
                <Input
                  id={field.name}
                  name={field.name}
                  type={field.type}
                  placeholder={field.placeholder}
                  required={field.required}
                  value={criteria[field.name] ?? ""}
                  onChange={(event) => handleFieldChange(field.name, event.target.value)}
                />
              )}
              {field.helpText ? <p className="mt-1 text-xs text-muted">{field.helpText}</p> : null}
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/60 pt-4">
            <p className="text-sm text-muted">
              Costo estimado:{" "}
              <span className="tabular text-ink">
                {estimatedCost != null ? `US$ ${estimatedCost.toFixed(2)}` : "—"}
              </span>
            </p>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Generar lista
            </Button>
          </div>
        </form>

        {state && !state.ok ? (
          <p className="flex items-center gap-1.5 text-sm text-danger">
            <XCircle className="size-4" />
            {state.message}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
