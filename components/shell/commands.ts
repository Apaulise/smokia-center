import { CalendarPlus, LayoutGrid, Settings, type LucideIcon } from "lucide-react";

import { MODULES } from "@/components/shell/nav";

/**
 * Lo que se puede hacer desde ⌘K y desde el teclado: ir a cualquier pantalla
 * de un gestor habilitado y un par de acciones. Sale de `MODULES` (nav.ts), así
 * que una pantalla nueva aparece sola en la búsqueda.
 *
 * Atajos de dos teclas: `G` + letra para ir a una pantalla y `N` + letra para
 * crear. Los maneja `useCommandShortcuts` (sidebar.tsx) en toda la app.
 */
export type Command = {
  key: string;
  group: "IR A" | "ACCIONES";
  label: string;
  /** El gestor: se muestra a la derecha y también se busca por él. */
  section: string;
  href: string;
  icon: LucideIcon;
  /** Dos letras separadas por un espacio: «G D». */
  shortcut?: string;
  /** Otras palabras con las que se lo busca. */
  keywords?: string;
};

const SECTION: Record<string, string> = {
  "/leads": "Leads",
  "/operaciones": "Operaciones",
  "/marca": "Marca personal",
};

const SHORTCUT: Record<string, string> = {
  "/leads": "G D",
  "/leads/lista": "G L",
  "/leads/generar": "G G",
  "/leads/seguimiento": "G S",
  "/leads/chats": "G C",
  "/leads/agenda": "G A",
  "/leads/conocimiento": "G M",
  "/operaciones": "G O",
  "/marca": "G P",
};

const KEYWORDS: Record<string, string> = {
  "/leads/chats": "instagram mensajes inbox dm bandeja",
  "/leads/seguimiento": "follow up pendientes",
  "/leads/agenda": "turnos reuniones calendario",
  "/leads/generar": "apify scraper nueva lista",
  "/leads/conocimiento": "objeciones dolores angulos",
  "/operaciones/aprobaciones": "agentes cola",
  "/marca/contenido": "reels publicaciones posts",
  "/marca/planificador": "calendario publicar",
  "/marca/generar": "ideas guion caption",
};

export const COMMANDS: Command[] = [
  { key: "inicio", group: "IR A", label: "Todos los gestores", section: "Inicio", href: "/", icon: LayoutGrid, shortcut: "G I", keywords: "inicio home" },
  ...MODULES.filter((module) => module.available).flatMap((module) =>
    (module.children ?? []).map<Command>((child) => ({
      key: child.href,
      group: "IR A",
      label: child.label,
      section: SECTION[module.href] ?? module.label,
      href: child.href,
      icon: child.icon,
      shortcut: SHORTCUT[child.href],
      keywords: KEYWORDS[child.href],
    })),
  ),
  { key: "configuracion", group: "IR A", label: "Configuración", section: "Cuenta", href: "/configuracion", icon: Settings, keywords: "api keys instagram zernio rubros perfil" },
  { key: "nuevo-turno", group: "ACCIONES", label: "Nuevo turno", section: "Leads", href: "/leads/agenda?nuevo=1", icon: CalendarPlus, shortcut: "N T", keywords: "agendar reunion" },
];

/** Para buscar sin que importen las tildes ni las mayúsculas: «análisis» = «ANALISIS». */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Los comandos que coinciden con lo escrito, primero los que empiezan con eso. Sin texto, todos. */
export function matchCommands(query: string): Command[] {
  const term = normalizeSearch(query);
  if (!term) return COMMANDS;
  return COMMANDS.map((command, index) => {
    const label = normalizeSearch(command.label);
    const rest = normalizeSearch(`${command.section} ${command.keywords ?? ""}`);
    const score = label.startsWith(term) ? 3 : label.includes(term) ? 2 : rest.includes(term) ? 1 : 0;
    return { command, index, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.command);
}

/** «g d» → la ruta. Las secuencias de los atajos, en minúscula. */
export const SHORTCUT_ROUTES: ReadonlyMap<string, string> = new Map(
  COMMANDS.filter((command) => command.shortcut).map((command) => [command.shortcut!.toLowerCase(), command.href]),
);
