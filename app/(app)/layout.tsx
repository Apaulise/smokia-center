import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { Sidebar } from "@/components/shell/sidebar";
import { countKnowledgeNotes } from "@/lib/brand/knowledge/queries";
import { countOpenContentItems } from "@/lib/brand/planner/queries";
import { countBrandPosts } from "@/lib/brand/queries";
import { countLeadLists, countTodayAppointments } from "@/lib/leads/queries";
import { countPendingApprovals } from "@/lib/ops/queries";
import { displayName, getProfile } from "@/lib/profile/queries";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Shell de todo lo autenticado. El middleware ya bloquea el acceso sin sesión;
 * esta comprobación es la segunda barrera, por si alguna ruta quedara fuera del
 * matcher.
 *
 * "Vidrio" (CLAUDE.md §6): en desktop la barra lateral y el escenario son dos
 * paneles que flotan sobre el fondo, con 12px de aire (`--lm-shell-gap`). En
 * mobile no hay aire: la barra superior y el escenario van a sangre.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Embebido como preview en la pantalla global (ver proxy.ts): sólo el contenido.
  if ((await headers()).get("x-preview") === "1") {
    // El preview se ve a ~30% de tamaño: animaciones y fondo fijo sólo cuestan CPU.
    // Sin shell alrededor, `--lm-shell-y` vale 0 (las pantallas de alto fijo usan todo el iframe).
    return (
      <>
        <style>{`:root{--lm-shell-y:0px!important}body{background:var(--color-lm-bg)!important}*,*::before,*::after{animation:none!important;transition:none!important}`}</style>
        <main className="min-w-0">{children}</main>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row lg:gap-(--lm-shell-gap) lg:p-(--lm-shell-gap)">
      <div className="lm-ambient" aria-hidden />
      <Suspense fallback={<SidebarFallback />}>
        <SidebarData email={user.email} />
      </Suspense>
      {/* overflow-clip y no hidden: recorta las esquinas sin volverse contenedor de scroll, así `sticky` sigue pegándose a la ventana. */}
      <main className="lm-stage min-w-0 flex-1 lg:overflow-clip lg:rounded-lm-2xl">{children}</main>
    </div>
  );
}

/** Los contadores no bloquean el contenido principal: llegan en streaming. */
async function SidebarData({ email }: { email?: string }) {
  const [listsCount, todayAppointmentsCount, postsCount, openItemsCount, notesCount, pendingApprovals, profile] = await Promise.all([
    countLeadLists(),
    countTodayAppointments(),
    countBrandPosts(),
    countOpenContentItems(),
    countKnowledgeNotes(),
    countPendingApprovals(),
    getProfile(),
  ]);

  return (
    <Sidebar
      name={displayName(profile, email)}
      avatarUrl={profile.avatarUrl}
      badges={{
        "/leads/lista": listsCount,
        "/leads/agenda": todayAppointmentsCount,
        "/marca/contenido": postsCount,
        "/marca/planificador": openItemsCount,
        "/marca/conocimiento": notesCount,
        "/operaciones/aprobaciones": pendingApprovals,
      }}
    />
  );
}

/** La forma de la barra lateral mientras llegan los contadores: mismo panel flotante, mismos renglones. */
function SidebarFallback() {
  return (
    <aside
      className="lm-glass hidden w-60 shrink-0 rounded-lm-xl border p-4 lg:sticky lg:top-(--lm-shell-gap) lg:block lg:h-[calc(100dvh-var(--lm-shell-y))]"
      aria-label="Cargando navegación"
    >
      {/* El alto va por `style`: `.lm-smoke` fija 12px y le gana a una utilidad `h-*`. */}
      <div className="lm-smoke" style={{ height: 28, width: 112 }} />
      <div className="mt-10 flex flex-col gap-3">
        {[80, 64, 72, 56, 68, 60].map((width) => (
          <div key={width} className="lm-smoke" style={{ height: 32, width: `${width}%` }} />
        ))}
      </div>
    </aside>
  );
}
