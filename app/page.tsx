import { Activity, LayoutGrid, Megaphone, Receipt, Settings, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { BrandLockup } from "@/components/shell/brand-lockup";
import { HubCard } from "@/components/shell/hub-card";
import { ScreenPreview } from "@/components/shell/screen-preview";
import { ProfileEditor } from "@/components/shell/profile-editor";
import { SignOutButton } from "@/components/shell/sign-out-button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { displayName, getProfile } from "@/lib/profile/queries";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Inicio · ALTAB" };

/**
 * Pantalla global: elegir a qué gestor entrar. Cada gestor es un espacio
 * separado (sidebar propio, ver components/shell/sidebar.tsx); acá se ve la
 * pantalla principal real de cada uno, en un iframe (ScreenPreview). Vive
 * fuera de `(app)` a propósito: sin sidebar, porque todavía no se está dentro
 * de ningún gestor.
 */
export default async function HubPage() {
  // En paralelo: el perfil no depende del usuario (RLS ya filtra por la sesión).
  const [user, profile] = await Promise.all([getCurrentUser(), getProfile()]);
  if (!user) redirect("/login");
  const name = displayName(profile, user.email);

  return (
    <>
      <div className="hub-backdrop" aria-hidden="true" />
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-6 px-4 pb-[max(2rem,env(safe-area-inset-bottom,0px))] pt-[max(1.5rem,env(safe-area-inset-top,0px))] sm:gap-10 sm:px-6 sm:py-8 lg:py-12">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-4 sm:gap-4">
          <BrandLockup />
          <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-2.5">
            <ProfileEditor
              userId={user.id}
              name={name}
              alias={profile.alias}
              avatarUrl={profile.avatarUrl}
            />
            <div className="min-w-0 max-w-56">
              <p className="font-lm-sans text-[11px] font-semibold tracking-[0.1em] text-lm-ink-3 uppercase">
                Cuenta
              </p>
              <p className="truncate font-lm-sans text-lg font-medium text-lm-ink">
                {name}
              </p>
            </div>
          </div>
          <nav aria-label="Cuenta" className="flex basis-full flex-wrap items-center gap-1 rounded-lm-lg border border-lm-line px-2 py-1 sm:basis-auto sm:border-0 sm:p-0">
            <ThemeToggle className="mr-auto min-w-0 sm:mr-2 sm:w-[168px]" />
            <Link
              href="/configuracion"
              aria-label="Configuración"
              className="flex h-11 items-center gap-2 rounded-lm-sm px-2.5 text-sm text-lm-ink-2 transition-colors active:bg-lm-raised hover:bg-lm-raised hover:text-lm-ink sm:h-8"
            >
              <Settings className="size-4" strokeWidth={1.5} />
              <span className="hidden sm:inline">Configuración</span>
            </Link>
            <SignOutButton />
          </nav>
        </header>

        <h1 className="text-2xl font-semibold tracking-tight sm:sr-only">Todos los gestores</h1>
        <section
          aria-label="Gestores"
          className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2 md:gap-6"
        >
          <HubCard
            eyebrow="Fase 3"
            title="Gestor de Marca Personal"
            href="/marca"
            icon={<Megaphone className="size-4" strokeWidth={1.5} />}
          >
            <ScreenPreview
              src="/marca"
              title="Vista previa del Gestor de Marca Personal"
            />
          </HubCard>

          <HubCard
            eyebrow="Fase 1"
            title="Gestor de Leads"
            href="/leads"
            icon={<Users className="size-4" strokeWidth={1.5} />}
          >
            <ScreenPreview
              src="/leads"
              title="Vista previa del Gestor de Leads"
            />
          </HubCard>

          <HubCard
            eyebrow="Estado del negocio"
            title="Gestor de Operaciones"
            href="/operaciones"
            icon={<Activity className="size-4" strokeWidth={1.5} />}
          >
            <ScreenPreview
              src="/operaciones"
              title="Vista previa del Gestor de Operaciones"
            />
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
    </>
  );
}
