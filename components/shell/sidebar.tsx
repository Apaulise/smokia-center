"use client";

import {
  Activity,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  Search,
  Settings,
  Users,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { MODULES, type NavModule } from "@/components/shell/nav";
import { usePendingPath } from "@/components/shell/navigation-state";
import { ProfileAvatar } from "@/components/shell/profile-avatar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useCommandShortcuts } from "@/components/shell/use-command-shortcuts";
import { Dialog } from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/*
 * Shell de navegación en "Vidrio" (CLAUDE.md §6): un panel flotante de 240px
 * (60px colapsado). Colapsado es un riel de íconos redondos, uno por pantalla
 * del módulo, como el de la referencia: por eso cada `NavChild` trae su ícono.
 * El ítem activo es una pastilla de vidrio que se desliza, con el ícono en
 * `signal`. Es infraestructura compartida por todos los módulos, no contenido
 * de un módulo puntual.
 */
const ICONS = {
  panel: LayoutGrid,
  leads: Users,
  operaciones: Activity,
  facturacion: Receipt,
  marca: Megaphone,
} as const;

const COLLAPSE_STORAGE_KEY = "smokia:sidebar-collapsed";
/** `storage` sólo avisa a las otras pestañas; este evento avisa a la propia. */
const COLLAPSE_EVENT = "smokia:sidebar-collapsed-change";

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function subscribeCollapsed(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(COLLAPSE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(COLLAPSE_EVENT, onChange);
  };
}

function isModuleActive(pathname: string, module: NavModule) {
  return pathname === module.href || pathname.startsWith(`${module.href}/`);
}

export function Sidebar({
  name,
  avatarUrl,
  badges,
}: {
  name: string;
  avatarUrl: string | null;
  badges?: Record<string, number>;
}) {
  const currentPathname = usePathname();
  // Ruta efectiva: la que se está abriendo, si hay una. El ítem activo del menú
  // cambia en el mismo instante del clic en vez de esperar a que cargue la pantalla.
  const pendingPath = usePendingPath();
  const pathname = pendingPath ?? currentPathname;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // El snapshot de servidor (false) es el que se usa al hidratar, así server y
  // cliente coinciden; después React relee localStorage y re-renderiza.
  // Cada gestor es un espacio separado: el sidebar sólo muestra el módulo en el que se está.
  const activeModule = MODULES.find((module) => module.available && isModuleActive(currentPathname, module));
  const ActiveIcon = activeModule ? ICONS[activeModule.icon] : LayoutGrid;
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  // G D, G C, N T…: los atajos de toda la app (commands.ts). Con ⌘K abierto manda la paleta.
  useCommandShortcuts(!paletteOpen);

  // Cerrar el menú mobile al navegar: se ajusta durante el render, no en un
  // efecto, para no pagar un render extra con el menú todavía abierto.
  const [lastPathname, setLastPathname] = useState(currentPathname);
  if (currentPathname !== lastPathname) {
    setLastPathname(currentPathname);
    setOpen(false);
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function toggleCollapsed() {
    try {
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(!collapsed));
    } catch {
      // Sin storage (modo privado estricto) el colapso simplemente no se recuerda.
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const navigation = (
    <>
        <div
          className={cn(
            "hidden h-14 shrink-0 items-center gap-2 px-3",
            collapsed ? "lg:flex lg:justify-center" : "lg:flex lg:justify-between lg:pl-4",
          )}
        >
          {collapsed ? null : (
            <Link href="/" className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.02em] text-lm-ink">
              {/* 230×400 real: declarar el ratio real evita el warning de Next por width/height que no matchean el CSS. */}
              <Image src="/logo-mark.png" alt="" width={15} height={26} className="h-[26px] w-auto shrink-0" priority />
              SmokIA
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className={cn(RAIL_BUTTON, "size-9 shrink-0 text-lm-ink-3")}
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            title={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          >
            {collapsed ? <ChevronRight className="size-4" strokeWidth={1.5} /> : <ChevronLeft className="size-4" strokeWidth={1.5} />}
          </button>
        </div>

        <div className={cn("px-3 pt-3 pb-2 lg:pt-0", collapsed && "lg:px-0 lg:pb-1")}>
          <button
            type="button"
            onClick={() => { setOpen(false); setPaletteOpen(true); }}
            title={collapsed ? "Buscar o ejecutar (⌘K)" : undefined}
            aria-label="Buscar o ejecutar"
            className={cn(
              "flex h-9 w-full items-center gap-2 rounded-lm-sm border border-lm-line bg-lm-ink/5 px-2.5 text-left text-[13px] text-lm-ink-3 transition-colors hover:bg-lm-ink/10 hover:text-lm-ink-2 focus-visible:lm-focus",
              collapsed && "lg:mx-auto lg:size-9 lg:justify-center lg:rounded-full lg:border-transparent lg:bg-transparent lg:px-0",
            )}
          >
            <Search className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn("flex-1 truncate", collapsed && "lg:hidden")}>Buscar o ejecutar…</span>
            <span className={cn("rounded-lm-xs border border-lm-line px-1 py-px font-mono text-[10.5px] text-lm-ink-3", collapsed && "lg:hidden")}>
              ⌘K
            </span>
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-1" aria-label="Navegación">
          <Link
            href="/"
            title={collapsed ? "Todos los gestores" : undefined}
            className={cn(RAIL_ROW, "text-lm-ink-2", collapsed && RAIL_ROW_COLLAPSED)}
          >
            <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn("truncate", collapsed && "lg:hidden")}>Todos los gestores</span>
          </Link>

          {activeModule ? (
            <div className="pt-3">
              <div
                title={collapsed ? activeModule.label : undefined}
                className={cn("flex h-9 items-center gap-2.5 px-1.5", collapsed && "lg:justify-center lg:px-0")}
              >
                {/* El módulo en el que se está: la ficha amarilla, como el ícono de marca de la referencia. */}
                <span className="grid size-[26px] shrink-0 place-items-center rounded-lm-xs bg-lm-signal text-lm-on-signal">
                  <ActiveIcon className="size-[15px]" strokeWidth={1.75} />
                </span>
                <span className={cn("truncate text-[13px] font-semibold text-lm-ink", collapsed && "lg:hidden")}>{activeModule.label}</span>
              </div>

              {activeModule.children ? (
                <ChildNav module={activeModule} pathname={pathname} badges={badges} collapsed={collapsed} onNavigate={() => setOpen(false)} />
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className={cn("flex flex-col gap-1 border-t border-lm-line px-3 py-3", collapsed && "lg:px-3")}>
          <Link
            href="/configuracion"
            title={collapsed ? "Configuración" : undefined}
            aria-current={pathname.startsWith("/configuracion") ? "page" : undefined}
            className={cn(
              RAIL_ROW,
              pathname.startsWith("/configuracion") ? "bg-lm-ink/8 text-lm-ink" : "text-lm-ink-2",
              collapsed && RAIL_ROW_COLLAPSED,
            )}
          >
            <Settings className={cn("size-4 shrink-0", pathname.startsWith("/configuracion") && "text-lm-signal-text")} strokeWidth={1.5} />
            <span className={cn(collapsed && "lg:hidden")}>Configuración</span>
          </Link>

          <button
            type="button"
            onClick={signOut}
            title={collapsed ? "Salir" : undefined}
            className={cn(RAIL_ROW, "w-full cursor-pointer text-lm-ink-2", collapsed && RAIL_ROW_COLLAPSED)}
          >
            <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn(collapsed && "lg:hidden")}>Salir</span>
          </button>

          <div className={cn("pt-1", collapsed && "lg:hidden")}>
            <ThemeToggle />
          </div>
          {collapsed ? <ThemeToggle variant="icon" className="hidden lg:flex" /> : null}

          <div
            className={cn("flex items-center gap-2.5 px-1.5 pt-2", collapsed && "lg:justify-center lg:px-0")}
            title={collapsed ? name : undefined}
          >
            <ProfileAvatar url={avatarUrl} name={name} className="size-[30px] text-xs" />
            <span className={cn("min-w-0 flex-1 truncate text-[13px] text-lm-ink", collapsed && "lg:hidden")}>{name}</span>
          </div>
        </div>
    </>
  );

  return (
    <>
      <header className="lm-mobile-header flex shrink-0 items-center justify-between border-b border-lm-line bg-lm-surface px-4 lg:hidden">
        <Link href="/" className="flex min-h-11 items-center gap-2 font-lm-sans text-[15px] font-semibold text-lm-ink">
          <Image src="/logo-mark.png" alt="" width={13} height={22} className="h-[22px] w-auto shrink-0" />
          SmokIA
        </Link>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setPaletteOpen(true)} aria-label="Buscar un lead, una lista o una pantalla"
            className="grid size-11 place-items-center rounded-full bg-lm-ink/5 text-lm-ink-2 active:bg-lm-ink/15 focus-visible:lm-focus">
            <Search className="size-4" strokeWidth={1.5} />
          </button>
          <button type="button" onClick={() => setOpen(true)} aria-label="Abrir menú" aria-expanded={open}
            className="grid size-11 place-items-center rounded-full bg-lm-ink/5 text-lm-ink-2 active:bg-lm-ink/15 focus-visible:lm-focus">
            <Menu className="size-5" strokeWidth={1.5} />
          </button>
        </div>
      </header>
      <aside className={cn(
        "lm-glass hidden min-h-0 flex-col font-lm-sans",
        "lg:sticky lg:top-(--lm-shell-gap) lg:flex lg:h-[calc(100dvh-var(--lm-shell-y))] lg:shrink-0 lg:overflow-hidden lg:rounded-lm-xl lg:border",
        "lg:transition-[width] lg:duration-200 lg:ease-out motion-reduce:transition-none",
        collapsed ? "lg:w-[60px]" : "lg:w-60",
      )}>{navigation}</aside>
      <Dialog open={open && !paletteOpen} onClose={() => setOpen(false)} sheet title="Navegación" overlayClassName="lg:hidden"
        className="[&_nav_a]:min-h-11 [&_nav_span.pointer-events-none]:hidden [&_a[aria-current=page]]:bg-lm-ink/8">
        {navigation}
      </Dialog>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}

/** Renglón del riel: 36px de alto; colapsado es un círculo de 36px centrado. */
const RAIL_ROW =
  "relative flex h-9 items-center gap-2.5 rounded-lm-md px-2.5 text-[13px] transition-colors duration-150 ease-out hover:bg-lm-ink/6 hover:text-lm-ink focus-visible:lm-focus";
const RAIL_ROW_COLLAPSED = "lg:mx-auto lg:w-9 lg:justify-center lg:rounded-full lg:px-0";
const RAIL_BUTTON =
  "flex items-center justify-center rounded-full transition-colors duration-150 ease-out hover:bg-lm-ink/8 hover:text-lm-ink focus-visible:lm-focus";

/** Alto de cada ítem (h-9 = 36px) + separación (gap-1 = 4px): lo que baja la pastilla por ítem. */
const CHILD_PITCH_PX = 40;

function isChildActive(pathname: string, child: { href: string; exact?: boolean }) {
  return child.exact ? pathname === child.href : pathname === child.href || pathname.startsWith(`${child.href}/`);
}

/**
 * Pantallas del módulo activo. La pastilla de vidrio del ítem elegido es un solo
 * elemento que se desliza hasta la pestaña (transform, 200ms ease-out) en vez
 * de apagarse en una y encenderse en otra: se lee como un único foco que se
 * mueve. Con la barra colapsada la pastilla es un círculo y de cada pantalla
 * queda su ícono (el nombre va en `title` y `aria-label`).
 */
function ChildNav({
  module,
  pathname,
  badges,
  collapsed,
  onNavigate,
}: {
  module: NavModule;
  pathname: string;
  badges?: Record<string, number>;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const children = module.children ?? [];
  const activeIndex = children.findIndex((child) => isChildActive(pathname, child));

  return (
    <div className="relative mt-1 flex flex-col gap-1">
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-0 right-0 left-0 h-9 rounded-lm-md bg-lm-ink/8",
          "shadow-[inset_0_1px_0_var(--lm-glass-edge),0_3px_8px_-4px_var(--lm-panel-shadow)]",
          "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
          collapsed && "lg:mx-auto lg:w-9 lg:rounded-full",
          activeIndex < 0 && "opacity-0",
        )}
        style={{ transform: `translateY(${Math.max(activeIndex, 0) * CHILD_PITCH_PX}px)` }}
      />
      {children.map((child, index) => {
        const badge = badges?.[child.href];
        const active = index === activeIndex;
        const Icon = child.icon;

        return (
          <Link
            key={child.href}
            href={child.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            aria-label={collapsed ? child.label : undefined}
            title={collapsed ? (badge ? `${child.label} · ${badge}` : child.label) : undefined}
            className={cn(
              RAIL_ROW,
              active ? "font-medium text-lm-ink hover:bg-transparent" : "text-lm-ink-2",
              collapsed && RAIL_ROW_COLLAPSED,
            )}
          >
            <Icon className={cn("size-4 shrink-0 transition-colors duration-150", active && "text-lm-signal-text")} strokeWidth={1.5} />
            <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>{child.label}</span>
            {badge ? (
              <>
                <span className={cn("shrink-0 font-mono text-[11px] text-lm-ink-3", collapsed && "lg:hidden")}>{badge}</span>
                {/* Colapsado no entra el número: queda un punto que avisa que hay algo. */}
                {collapsed ? <span className="absolute top-1.5 right-1.5 hidden size-1.5 rounded-full bg-lm-signal lg:block" aria-hidden /> : null}
              </>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
