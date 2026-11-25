import {
  Activity,
  AlarmClock,
  BookOpen,
  Building2,
  Boxes,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ChartNoAxesCombined,
  ClipboardCheck,
  FolderKanban,
  Gauge,
  LayoutDashboard,
  Library,
  ListChecks,
  ListPlus,
  Mail,
  MessageSquare,
  Radar,
  ShieldCheck,
  Target,
  Users,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

import type { ComponentType } from "react";

import { GmailIcon, GoogleCalendarIcon, InstagramIcon } from "@/components/shell/brand-icons";

/** Logo de marca: un componente SVG que acepta `className` (ver brand-icons.tsx). */
type BrandIcon = ComponentType<{ className?: string; strokeWidth?: number }>;

/**
 * Las patas del negocio, Operaciones (el estado de los agentes) y el panel que las agrega.
 *
 * Los módulos no construidos quedan visibles pero deshabilitados a propósito:
 * la estructura del negocio se lee completa desde el día 1 y no hay que
 * rediseñar la navegación en cada fase (CLAUDE.md §2).
 */
export interface NavChild {
  href: string;
  label: string;
  /** Con la barra colapsada es lo único que se ve de la pantalla: tiene que distinguirse de las demás del módulo. */
  icon: LucideIcon;
  /** Logo de la integración que alimenta la pantalla (Instagram, Gmail, Google Calendar). Reemplaza al `icon` donde se muestra. */
  brand?: BrandIcon;
  /** Sólo marca activo con match exacto. Para el índice de un módulo. */
  exact?: boolean;
  /** Pantalla todavía no construida: se ve en el menú, deshabilitada, sin link ni entrada en ⌘K (CLAUDE.md §2). */
  soon?: boolean;
}

export interface NavModule {
  href: string;
  label: string;
  icon: "panel" | "leads" | "operaciones" | "marca" | "facturacion";
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
      { href: "/leads", label: "Dashboard", icon: LayoutDashboard, exact: true },
      { href: "/leads/equipo", label: "Equipo", icon: Users },
      { href: "/leads/objetivo", label: "Objetivo", icon: Target },
      { href: "/leads/lista", label: "Listas", icon: ListChecks },
      { href: "/leads/generar", label: "Generar lista", icon: ListPlus },
      { href: "/leads/seguimiento", label: "Seguimiento", icon: AlarmClock },
      { href: "/leads/chats", label: "Chats", icon: MessageSquare, brand: InstagramIcon },
      { href: "/leads/correo", label: "Correo", icon: Mail, brand: GmailIcon },
      { href: "/leads/clientes", label: "Clientes", icon: Building2 },
      { href: "/leads/proyectos", label: "Proyectos", icon: FolderKanban },
      { href: "/leads/agenda", label: "Agenda", icon: CalendarDays, brand: GoogleCalendarIcon },
      { href: "/leads/conocimiento", label: "Memoria de ventas", icon: BookOpen },
    ],
  },
  {
    href: "/operaciones",
    label: "Gestor de Operaciones",
    icon: "operaciones",
    available: true,
    children: [
      { href: "/operaciones", label: "Resumen", icon: Activity, exact: true },
      { href: "/operaciones/aprobaciones", label: "Aprobaciones", icon: ClipboardCheck },
      { href: "/operaciones/areas", label: "Áreas", icon: Boxes },
      { href: "/operaciones/analisis", label: "Análisis semanal", icon: ChartNoAxesCombined },
      { href: "/operaciones/auditor", label: "Auditor", icon: ShieldCheck },
    ],
  },
  {
    href: "/marca",
    label: "Gestor de Marca Personal",
    icon: "marca",
    available: true,
    children: [
      { href: "/marca", label: "Resumen", icon: Gauge, exact: true },
      { href: "/marca/contenido", label: "Biblioteca", icon: Library },
      { href: "/marca/analisis", label: "Análisis", icon: ChartColumn },
      { href: "/marca/planificador", label: "Planificador", icon: CalendarRange },
      { href: "/marca/competencia", label: "Competencia", icon: Radar },
      { href: "/marca/conocimiento", label: "Base de conocimiento", icon: BookOpen },
      { href: "/marca/generar", label: "Generar contenido", icon: WandSparkles },
    ],
  },
  {
    href: "/facturacion",
    label: "Gestor de Facturación",
    icon: "facturacion",
    available: false,
  },
];
