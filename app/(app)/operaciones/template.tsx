import { PageTransition } from "@/components/shell/page-transition";

/** Se remonta en cada cambio de pantalla: de acá sale la transición de ruta. */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>;
}
