/**
 * Las tres patas del negocio más el panel que las agrega.
 *
 * Los módulos no construidos quedan visibles pero deshabilitados a propósito:
 * la estructura del negocio se lee completa desde el día 1 y no hay que
 * rediseñar la navegación en cada fase (CLAUDE.md §2).
 */
export interface NavChild {
  href: string;
  label: string;
  /** Sólo marca activo con match exacto. Para el índice de un módulo. */
  exact?: boolean;
}

export interface NavModule {
  href: string;
  label: string;
  icon: "panel" | "leads" | "facturacion" | "marca";
  available: boolean;
  children?: NavChild[];
}

export const MODULES: NavModule[] = [
  {
    href: "/panel",
    label: "Panel principal",
    icon: "panel",
    available: false,
  },
  {
    href: "/leads",
    label: "Gestor de Leads",
    icon: "leads",
    available: true,
    children: [
      { href: "/leads", label: "Dashboard", exact: true },
      { href: "/leads/lista", label: "Listas" },
      { href: "/leads/generar", label: "Generar lista" },
      { href: "/leads/agenda", label: "Agenda" },
      { href: "/leads/conocimiento", label: "Memoria de ventas" },
    ],
  },
  {
    href: "/facturacion",
    label: "Gestor de Facturación",
    icon: "facturacion",
    available: false,
  },
  {
    href: "/marca",
    label: "Gestor de Marca Personal",
    icon: "marca",
    available: true,
    children: [
      { href: "/marca", label: "Dashboard", exact: true },
      { href: "/marca/contenido", label: "Contenido" },
      { href: "/marca/analisis", label: "Análisis" },
      { href: "/marca/generar", label: "Generar contenido" },
      { href: "/marca/planificador", label: "Planificador" },
      { href: "/marca/competencia", label: "Competencia" },
      { href: "/marca/conocimiento", label: "Conocimiento" },
    ],
  },
];
