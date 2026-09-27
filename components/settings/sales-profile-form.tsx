"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useActionState } from "react";

import { Button } from "@/components/leads/ui/button";
import { Field, Textarea } from "@/components/leads/ui/field";
import { saveSalesProfile } from "@/lib/settings/actions";

const PLACEHOLDER = `Trabajo solo, con automatizaciones e IA para negocios de servicios.

Casos reales:
- Una barbería: gestión de clientes y recordatorios de turno.

Todavía no tengo casos en estética, salud ni gastronomía.`;

export function SalesProfileForm({ profile }: { profile: string }) {
  const [state, formAction, pending] = useActionState(saveSalesProfile, null);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field
        label="Qué puede afirmar el copiloto sobre vos"
        htmlFor="profile"
        hint={
          <>
            Escribí sólo lo que es verdad y verificable. El copiloto tiene prohibido mencionar experiencia, clientes o
            resultados que no estén acá — si lo dejás vacío, no va a afirmar ninguno. Poné también lo que{" "}
            <span className="text-lm-ink-2">no</span> tenés: le evita prometer de más.
          </>
        }
      >
        <Textarea id="profile" name="profile" defaultValue={profile} placeholder={PLACEHOLDER} className="min-h-48 font-mono text-xs" />
      </Field>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Guardar perfil
        </Button>
        {state ? (
          <p className={`flex items-center gap-1.5 text-[13px] ${state.ok ? "text-lm-success" : "text-lm-danger"}`}>
            {state.ok ? <CheckCircle2 className="size-4" strokeWidth={1.5} /> : <XCircle className="size-4" strokeWidth={1.5} />}
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
