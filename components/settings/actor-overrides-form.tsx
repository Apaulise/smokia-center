"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveActorOverride } from "@/lib/settings/actions";
import { PROVIDERS } from "@/lib/providers/registry";
import type { AnyLeadSourceProvider } from "@/lib/providers/types";
import { cn } from "@/lib/utils";

function ActorRow({
  provider,
  currentActorId,
}: {
  provider: AnyLeadSourceProvider;
  currentActorId: string;
}) {
  const [state, formAction, pending] = useActionState(saveActorOverride, null);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3 border-b border-line/60 py-3 last:border-0">
      <input type="hidden" name="source" value={provider.id} />
      <div className="min-w-[120px]">
        <p className="text-sm text-ink">{provider.label}</p>
        <p className="text-xs text-muted">{provider.defaultActorId || "Sin actor por default"}</p>
      </div>
      <div className="min-w-[220px] flex-1">
        <label htmlFor={`actor-${provider.id}`} className="mb-1.5 block text-xs text-muted">
          Actor de Apify
        </label>
        <Input
          id={`actor-${provider.id}`}
          name="actorId"
          defaultValue={currentActorId}
          placeholder={provider.defaultActorId || "usuario/nombre-del-actor"}
          required
        />
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
        Guardar
      </Button>
      {state ? (
        <p className={cn("flex w-full items-center gap-1.5 text-xs", state.ok ? "text-positive" : "text-danger")}>
          {state.ok ? <CheckCircle2 className="size-3.5" /> : <XCircle className="size-3.5" />}
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

/**
 * PROVIDERS se importa directo, no llega por props: trae ZodType y funciones,
 * no serializables por el borde RSC entre Server y Client Components.
 */
export function ActorOverridesForm({ overrides }: { overrides: Partial<Record<string, string>> }) {
  const providers: AnyLeadSourceProvider[] = PROVIDERS;
  return (
    <div>
      {providers.map((provider) => (
        <ActorRow
          key={provider.id}
          provider={provider}
          currentActorId={overrides[provider.id] ?? provider.defaultActorId}
        />
      ))}
    </div>
  );
}
