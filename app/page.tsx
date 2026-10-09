import { LayoutGrid, Megaphone, Receipt, Settings, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { HubCard } from "@/components/shell/hub-card";
import { ScreenPreview } from "@/components/shell/screen-preview";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Inicio · Awareness AI" };

/**
 * Pantalla global: elegir a qué gestor entrar. Cada gestor es un espacio
 * separado (sidebar propio, ver components/shell/sidebar.tsx); acá se ve un
 * la pantalla principal real de cada uno, en un iframe (ScreenPreview). Vive fuera de `(app)` a propósito: sin
 * sidebar, porque todavía no se está dentro de ningún gestor.
 */
export default async function HubPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const initial = (user.email ?? "?").charAt(0).toUpperCase();

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-10 px-6 py-8 lg:py-12">
      <header className="flex items-center gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-full border border-lm-line-strong bg-lm-raised font-lm-sans text-lg font-medium text-lm-ink"
          aria-hidden="true"
        >
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">Cuenta</p>
          <p className="truncate font-lm-sans text-lg font-medium text-lm-ink" title={user.email}>
            {user.email}
          </p>
        </div>
        <nav className="flex shrink-0 items-center gap-1">
          <Link
            href="/configuracion"
            className="flex h-8 items-center gap-2 rounded-lm-sm px-2.5 text-sm text-lm-ink-2 transition-colors hover:bg-lm-raised hover:text-lm-ink"
          >
            <Settings className="size-4" strokeWidth={1.5} />
            <span className="hidden sm:inline">Configuración</span>
          </Link>
          <SignOutButton />
        </nav>
      </header>

      <section aria-label="Gestores" className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <HubCard eyebrow="Fase 3" title="Gestor de Marca Personal" href="/marca" icon={<Megaphone className="size-4" strokeWidth={1.5} />}>
          <ScreenPreview src="/marca" title="Vista previa del Gestor de Marca Personal" />
        </HubCard>

        <HubCard eyebrow="Fase 1" title="Gestor de Leads" href="/leads" icon={<Users className="size-4" strokeWidth={1.5} />}>
          <ScreenPreview src="/leads" title="Vista previa del Gestor de Leads" />
        </HubCard>

        <HubCard
          eyebrow="Fase 2"
          title="Gestor de Facturación"
          href="/facturacion"
          icon={<Receipt className="size-4" strokeWidth={1.5} />}
          disabledNote="Ingresos, clientes y cobros. Todavía no está construido: un gestor por vez."
        />

        <HubCard
          eyebrow="Fase 4"
          title="Panel principal"
          href="/panel"
          icon={<LayoutGrid className="size-4" strokeWidth={1.5} />}
          disabledNote="Las métricas de las tres patas en una sola pantalla. Llega cuando los gestores estén en uso."
        />
      </section>
    </div>
  );
}
