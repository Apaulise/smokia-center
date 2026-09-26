"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { saveSalesProfile } from "@/lib/settings/actions";

const PLACEHOLDER = `Trabajo solo, con automatizaciones e IA para negocios de servicios.

Casos reales:
- Una barbería: gestión de clientes y recordatorios de turno.

Todavía no tengo casos en estética, salud ni gastronomía.`;

export function SalesProfileForm({ profile }: { profile: string }) {
  const [state, formAction, pending] = useActionState(saveSalesProfile, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="mb-1.5 block text-xs text-muted" htmlFor="profile">
          Qué puede afirmar el copiloto sobre vos
        </label>
        <Textarea
          id="profile"
          name="profile"
          defaultValue={profile}
          placeholder={PLACEHOLDER}
          className="min-h-48 font-mono text-xs"
        />
        <p className="mt-2 text-xs text-muted">
          Escribí sólo lo que es verdad y verificable. El copiloto tiene prohibido mencionar experiencia, clientes o
          resultados que no estén acá — si lo dejás vacío, no va a afirmar ninguno. Poné también lo que{" "}
          <span className="text-ink">no</span> tenés: le evita prometer de más.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar perfil
        </Button>
        {state ? (
          <p className={`flex items-center gap-1.5 text-sm ${state.ok ? "text-positive" : "text-danger"}`}>
            {state.ok ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
