import { redirect } from "next/navigation";

import { Sidebar } from "@/components/shell/sidebar";
import { countKnowledgeNotes } from "@/lib/brand/knowledge/queries";
import { countOpenContentItems } from "@/lib/brand/planner/queries";
import { countBrandPosts } from "@/lib/brand/queries";
import { countLeadLists, countTodayAppointments } from "@/lib/leads/queries";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Shell de todo lo autenticado. El middleware ya bloquea el acceso sin sesión;
 * esta comprobación es la segunda barrera, por si alguna ruta quedara fuera del
 * matcher.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Badges de conteo del sidebar (Design System, ítems "Listas"/"Agenda" de Leads y
  // "Biblioteca"/"Planificador"/"Base de conocimiento" de Marca) — counts livianos
  // (head: true, sin traer filas), no vale la pena condicionarlos a estar dentro
  // de un módulo: el sidebar es infra compartida y se ve en todas las pantallas.
  const [listsCount, todayAppointmentsCount, postsCount, openItemsCount, notesCount] = await Promise.all([
    countLeadLists(),
    countTodayAppointments(),
    countBrandPosts(),
    countOpenContentItems(),
    countKnowledgeNotes(),
  ]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        email={user.email}
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
