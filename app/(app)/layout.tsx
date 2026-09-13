import { redirect } from "next/navigation";

import { Sidebar } from "@/components/shell/sidebar";
import { getCurrentUser } from "@/lib/supabase/server";

/**
 * Shell de todo lo autenticado. El middleware ya bloquea el acceso sin sesión;
 * esta comprobación es la segunda barrera, por si alguna ruta quedara fuera del
 * matcher.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <Sidebar email={user.email} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
