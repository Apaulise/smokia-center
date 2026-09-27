import { redirect } from "next/navigation";

import { Sidebar } from "@/components/shell/sidebar";
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

  // Badges de conteo del sidebar (Design System, ítem "Listas"/"Agenda") —
  // dos counts livianos (head: true, sin traer filas), no vale la pena
  // condicionarlos a estar dentro de /leads: el sidebar es infra compartida
  // y se ve en todas las pantallas.
  const [listsCount, todayAppointmentsCount] = await Promise.all([countLeadLists(), countTodayAppointments()]);

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar
        email={user.email}
        badges={{ "/leads/lista": listsCount, "/leads/agenda": todayAppointmentsCount }}
      />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
