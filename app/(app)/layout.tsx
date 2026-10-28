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
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Embebido como preview en la pantalla global (ver proxy.ts): sólo el contenido.
  if ((await headers()).get("x-preview") === "1") {
    // El preview se ve a ~30% de tamaño: animaciones y fondo fijo sólo cuestan CPU.
    return (
      <>
        <style>{`body{background:var(--color-lm-bg)!important}*,*::before,*::after{animation:none!important;transition:none!important}`}</style>
        <main className="min-w-0">{children}</main>
      </>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Suspense fallback={<SidebarFallback />}>
        <SidebarData email={user.email} />
      </Suspense>
      <main className="min-w-0 flex-1">{children}</main>
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

function SidebarFallback() {
  return (
    <aside className="hidden min-h-dvh w-60 shrink-0 border-r border-lm-line bg-lm-surface p-5 lg:block" aria-label="Cargando navegación">
      <div className="h-7 w-28 animate-pulse rounded bg-lm-raised" />
      <div className="mt-10 flex flex-col gap-3">
        {[80, 64, 72, 56, 68, 60].map((width) => (
          <div key={width} className="h-8 animate-pulse rounded bg-lm-raised" style={{ width: `${width}%` }} />
        ))}
      </div>
    </aside>
  );
}
