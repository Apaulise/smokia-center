"use client";

import { Loader2, XCircle } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";

import { Button, Kbd } from "@/components/leads/ui/button";
import { Field, Input, Select, Textarea } from "@/components/leads/ui/field";
import { generateLeadList } from "@/lib/leads/actions";
import type { ApifyAccountLimits } from "@/lib/apify/client";
import type { ListPerformance } from "@/lib/leads/queries";
import type { AnyLeadSourceProvider } from "@/lib/providers/types";
import type { Database } from "@/lib/supabase/database.types";

type Industry = Database["public"]["Tables"]["industries"]["Row"];

const MAX_RESULTS_SLIDER = { min: 5, max: 100, step: 5, ticks: [5, 20, 50, 100] };

function defaultsFor(provider: AnyLeadSourceProvider): Record<string, string> {
  const defaults: Record<string, string> = {};
  for (const field of provider.fields) {
    if (field.defaultValue !== undefined) defaults[field.name] = String(field.defaultValue);
  }
  return defaults;
}

function formatUsd(value: number): string {
  return value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "{primer campo}" en {zona} — o el join de lo que haya, para proveedores sin zona. */
function buildQueryPreview(provider: AnyLeadSourceProvider, criteria: Record<string, string>) {
  const primaryName = provider.fields[0]?.name;
  const primaryValue = primaryName ? criteria[primaryName] : undefined;
  const hasZona = provider.fields.some((f) => f.name === "zona");

  if (primaryValue) {
    const zona = hasZona ? criteria.zona : undefined;
    return `“${primaryValue}”${zona ? ` en ${zona}` : ""}`;
  }
  // maxResults no es un término de búsqueda: si es lo único cargado (o el
  // form está vacío) no debe aparecer acá ni contar como "hay criterios".
  const rest = Object.entries(criteria)
    .filter(([key]) => key !== "maxResults")
    .map(([, value]) => value)
    .filter(Boolean);
  return rest.length > 0 ? rest.join(" · ") : "—";
}

/**
 * PROVIDERS se importa directo en `GenerarSourceSwitch`, no llega acá por
 * props: los proveedores traen ZodType y funciones, no serializables por el
 * borde RSC. `provider` ya viene elegido — la selección de fuente vive en
 * `GenerarSourceSwitch` (Design System §04, tarjetas), no acá.
 */
export function GenerarForm({
  provider,
  industries,
  listPerformance,
  apifyCredit,
}: {
  provider: AnyLeadSourceProvider;
  industries: Industry[];
  listPerformance: ListPerformance[];
  apifyCredit: ApifyAccountLimits | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const formRef = useRef<HTMLFormElement>(null);
  const [criteria, setCriteria] = useState<Record<string, string>>(() => defaultsFor(provider));
  const [industryId, setIndustryId] = useState("");
  const [manualName, setManualName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [state, formAction, pending] = useActionState(generateLeadList, null);

  useEffect(() => {
    if (state?.ok) router.replace(`${pathname}?job=${state.jobId}`, { scroll: false });
  }, [state, router, pathname]);

  // Nombre de lista autocompletado a partir de los criterios (Design System
  // §04: "Se completa solo; podés cambiarlo") — derivado en el render, no en
  // un efecto: deja de seguir en cuanto la persona lo edita a mano.
  const autoName = useMemo(() => {
    // Mismo criterio que buildQueryPreview: maxResults no cuenta como
    // "criterio de búsqueda" para armar el nombre.
    const values = Object.entries(criteria)
      .filter(([key]) => key !== "maxResults")
      .map(([, value]) => value)
      .filter(Boolean);
    return values.length > 0 ? values.join(" · ") : `${provider.label} — nueva búsqueda`;
  }, [criteria, provider.label]);
  const name = nameTouched ? manualName : autoName;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        formRef.current?.requestSubmit();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const estimatedCost = useMemo(() => {
    const parsed = provider.criteriaSchema.safeParse(criteria);
    if (!parsed.success) return null;
    try {
      return provider.estimateCost(parsed.data);
    } catch {
      return null;
    }
  }, [provider, criteria]);

  const queryPreview = useMemo(() => buildQueryPreview(provider, criteria), [provider, criteria]);
  const metaPreview = [criteria.maxResults ? `máx. ${criteria.maxResults}` : null, provider.label].filter(Boolean).join(" · ");

  const selectedIndustry = industries.find((i) => i.id === industryId);
  const zona = criteria.zona?.trim();
  const industryLists = selectedIndustry ? listPerformance.filter((list) => list.industry_name === selectedIndustry.name) : [];
  const zonaLists = zona
    ? industryLists.filter((list) => {
        const criteriaZona = (list.criteria as Record<string, unknown> | null)?.zona;
        return typeof criteriaZona === "string" && criteriaZona.toLowerCase().includes(zona.toLowerCase());
      })
    : [];
  const similarLists = (zonaLists.length > 0 ? zonaLists : industryLists).slice(0, 4);
  const similarTotal = similarLists.reduce((sum, list) => sum + list.lead_count, 0);

  function handleFieldChange(name: string, value: string) {
    setCriteria((current) => ({ ...current, [name]: value }));
  }

  const maxResultsField = provider.fields.find((f) => f.name === "maxResults");
  const otherFields = provider.fields.filter((f) => f.name !== "maxResults");
  const gridFields = otherFields.filter((f) => f.type !== "textarea");
  const wideFields = otherFields.filter((f) => f.type === "textarea");

  function renderField(field: (typeof provider.fields)[number]) {
    return (
      <Field key={field.name} label={field.label} htmlFor={field.name} hint={field.helpText}>
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
            mono={field.type === "number"}
          />
        )}
      </Field>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <form ref={formRef} id="generar-form" action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="source" value={provider.id} />

        {/* Campos cortos (rubro, zona…) en grilla de 2 — Design System §04; los de una sola línea van solos, textarea a lo ancho. */}
        {gridFields.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2">{gridFields.map((field) => renderField(field))}</div>
        ) : null}
        {wideFields.map((field) => renderField(field))}

        {maxResultsField ? (
          <>
            <MaxResultsSlider
              value={Number(criteria.maxResults ?? MAX_RESULTS_SLIDER.ticks[1])}
              onChange={(value) => handleFieldChange("maxResults", String(value))}
              helpText={maxResultsField.helpText}
            />
            {/* Viaja como input nativo del form aunque se dibuje como slider. */}
            <input type="hidden" name="maxResults" value={criteria.maxResults ?? ""} />
          </>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre de la lista" htmlFor="name" hint="Se completa solo; podés cambiarlo.">
            <Input
              id="name"
              name="name"
              value={name}
              onChange={(event) => {
                setNameTouched(true);
                setManualName(event.target.value);
              }}
              required
            />
          </Field>
          <Field label="Rubro a asignar" htmlFor="industryId" hint="Se asigna a cada lead que traiga esta lista.">
            <Select id="industryId" name="industryId" value={industryId} onChange={(event) => setIndustryId(event.target.value)}>
              <option value="">Sin asignar</option>
              {industries.map((industry) => (
                <option key={industry.id} value={industry.id}>
                  {industry.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </form>

      <div className="flex flex-col gap-6 lg:sticky lg:top-6">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Búsqueda</span>
            <div className="rounded-lm-sm border border-lm-line bg-lm-raised px-3 py-2">
              <p className="font-mono text-[13px] text-lm-ink">{queryPreview}</p>
              {metaPreview ? <p className="mt-0.5 font-mono text-xs text-lm-ink-3">{metaPreview}</p> : null}
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-lm-line pt-4">
            <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Costo</span>
            <p className="font-mono text-[30px] leading-9 font-medium tabular-nums text-lm-ink">
              {estimatedCost != null ? `≈ USD ${formatUsd(estimatedCost)}` : "—"}
            </p>
            {apifyCredit ? (
              <>
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span className="text-lm-ink-2">Crédito Apify restante</span>
                  <span className="font-mono text-lm-ink">USD {formatUsd(apifyCredit.remainingUsd)}</span>
                </div>
                <div className="flex items-center justify-between text-[13px]">
                  <span className="text-lm-ink-2">Después de esta lista</span>
                  <span className="font-mono text-lm-ink">
                    USD {formatUsd(Math.max(0, apifyCredit.remainingUsd - (estimatedCost ?? 0)))}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-xs text-lm-ink-3">Apify cobra por resultado. Empezá chico (5–20) para probar.</p>
            )}
          </div>

          {selectedIndustry && similarLists.length > 0 ? (
            <div className="flex flex-col gap-2 border-t border-lm-line pt-4">
              <span className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Listas parecidas</span>
              <ul className="flex flex-col gap-2 text-[13px]">
                {similarLists.map((list) => {
                  const contactRate = list.lead_count > 0 ? Math.round((list.contacted_count / list.lead_count) * 100) : 0;
                  return (
                    <li key={list.list_id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-lm-ink">{list.name}</p>
                        <p className="font-mono text-xs text-lm-ink-3">
                          {list.lead_count} leads · {list.contacted_count} contact.
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs text-lm-ink-3">{contactRate}%</span>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-lm-ink-3">
                Ya tenés {similarTotal} leads de {selectedIndustry.name}
                {zona ? ` en ${zona}` : ""}. Puede haber duplicados: se omiten automáticamente.
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-lm-line pt-4">
          {state && !state.ok ? (
            <p className="flex items-center gap-1.5 text-[13px] text-lm-danger">
              <XCircle className="size-4" strokeWidth={1.5} />
              {state.message}
            </p>
          ) : null}
          <Button type="submit" form="generar-form" variant="primary" disabled={pending} className="w-full">
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Generar lista
            <Kbd className="ml-1 border-lm-on-signal/30 text-lm-on-signal/70">⌘↵</Kbd>
          </Button>
        </div>
      </div>
    </div>
  );
}

function MaxResultsSlider({ value, onChange, helpText }: { value: number; onChange: (value: number) => void; helpText?: string }) {
  const { min, max, step, ticks } = MAX_RESULTS_SLIDER;
  return (
    <Field
      label={
        <span className="flex items-center justify-between">
          <span>Cantidad máxima</span>
          <span className="font-mono text-lm-ink">{value}</span>
        </span>
      }
      hint={helpText}
    >
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-lm-xs bg-lm-smoke-1"
        style={{ accentColor: "var(--color-lm-ink)" }}
      />
      <div className="mt-1 flex justify-between font-mono text-xs text-lm-ink-3">
        {ticks.map((tick) => (
          <span key={tick}>{tick}</span>
        ))}
      </div>
    </Field>
  );
}
