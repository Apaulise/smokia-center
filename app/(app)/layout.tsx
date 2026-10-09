import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { Sidebar } from "@/components/shell/sidebar";
import { countKnowledgeNotes } from "@/lib/brand/knowledge/queries";
import { countOpenContentItems } from "@/lib/brand/planner/queries";
import { countBrandPosts } from "@/lib/brand/queries";
import { countLeadLists, countTodayAppointments } from "@/lib/leads/queries";
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

  // Badges de conteo del sidebar (Design System, ítems "Listas"/"Agenda" de Leads y
  // "Biblioteca"/"Planificador"/"Base de conocimiento" de Marca) — counts livianos
  // (head: true, sin traer filas), no vale la pena condicionarlos a estar dentro
  // de un módulo: el sidebar es infra compartida y se ve en todas las pantallas.
  const [listsCount, todayAppointmentsCount, postsCount, openItemsCount, notesCount, profile] = await Promise.all([
    countLeadLists(),
    countTodayAppointments(),
    countBrandPosts(),
    countOpenContentItems(),
    countKnowledgeNotes(),
    getProfile(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        name={displayName(profile, user.email)}
        avatarUrl={profile.avatarUrl}
        badges={{
          "/leads/lista": listsCount,
          "/leads/agenda": todayAppointmentsCount,
          "/marca/contenido": postsCount,
          "/marca/planificador": openItemsCount,
          "/marca/conocimiento": notesCount,
        }}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
