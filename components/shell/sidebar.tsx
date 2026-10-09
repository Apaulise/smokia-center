"use client";

import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  Settings,
  Users,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { MODULES, type NavModule } from "@/components/shell/nav";
import { ProfileAvatar } from "@/components/shell/profile-avatar";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

/*
 * Shell de navegación (Design System Sidebar, "Señal y humo"): 240px
 * expandida / 64px colapsada (sólo íconos), marca vertical de 2px en
 * `signal` para el ítem activo. Es infraestructura compartida por todos los
 * módulos —incluida Marca personal—, no contenido de un módulo puntual, así
 * que se redibuja acá aunque Marca siga fuera de alcance (CLAUDE.md §2).
 */
const ICONS = {
  panel: LayoutGrid,
  leads: Users,
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
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // El snapshot de servidor (false) es el que se usa al hidratar, así server y
  // cliente coinciden; después React relee localStorage y re-renderiza.
  // Cada gestor es un espacio separado: el sidebar sólo muestra el módulo en el que se está.
  const activeModule = MODULES.find((module) => module.available && isModuleActive(pathname, module));
  const ActiveIcon = activeModule ? ICONS[activeModule.icon] : LayoutGrid;
  const collapsed = useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);

  // Cerrar el menú mobile al navegar: se ajusta durante el render, no en un
  // efecto, para no pagar un render extra con el menú todavía abierto.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
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

  return (
    <>
      {/* Barra superior — sólo mobile/tablet (<1280). En mobile puro (<768) el
          shell la reemplaza por el tab bar inferior, ver AppShellMobileNav. */}
      <header className="flex items-center justify-between border-b border-lm-line bg-lm-surface px-4 py-3 lg:hidden">
        <span className="font-lm-sans text-sm font-semibold text-lm-ink">
          Smok<span className="text-lm-ink-2">IA</span>
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-lm-sm border border-lm-line-strong p-2 text-lm-ink-2"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      <aside
        className={cn(
          "flex-col border-lm-line bg-lm-surface font-lm-sans",
          "lg:sticky lg:top-0 lg:flex lg:h-dvh lg:shrink-0 lg:border-r lg:transition-[width] lg:duration-150",
          collapsed ? "lg:w-16" : "lg:w-60",
          open ? "flex border-b" : "hidden",
        )}
      >
        <div
          className={cn(
            "hidden h-14 items-center gap-2 px-4",
            collapsed ? "lg:flex lg:justify-center lg:px-0" : "lg:flex lg:justify-between",
          )}
        >
          {collapsed ? null : (
            <Link href="/" className="flex items-center gap-2 text-[15px] font-semibold text-lm-ink">
              {/* 230×400 real: declarar el ratio real evita el warning de Next por width/height que no matchean el CSS. */}
              <Image src="/logo-mark.png" alt="" width={15} height={26} className="h-[26px] w-auto shrink-0" priority />
              SmokIA
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex shrink-0 items-center justify-center rounded-lm-sm p-1.5 text-lm-ink-3 transition-colors hover:bg-lm-raised hover:text-lm-ink"
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            title={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          >
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        </div>

        <div className={cn("px-2 pb-2", collapsed && "lg:hidden")}>
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex h-8 w-full items-center gap-2 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-2.5 text-left text-[13px] text-lm-ink-3 transition-colors hover:text-lm-ink-2"
          >
            <span className="flex-1 truncate">Buscar o ejecutar…</span>
            <span className="rounded-lm-xs border border-lm-line px-1 py-px font-mono text-[10.5px] text-lm-ink-3">
              ⌘K
            </span>
          </button>
        </div>

        <nav className={cn("flex-1 space-y-0.5 overflow-y-auto px-2 py-1", collapsed && "lg:px-2")}>
          <Link
            href="/"
            title={collapsed ? "Todos los gestores" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lm-sm px-2 text-sm text-lm-ink-2 transition-colors hover:bg-lm-raised hover:text-lm-ink",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <ArrowLeft className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn("truncate", collapsed && "lg:hidden")}>Todos los gestores</span>
          </Link>

          {activeModule ? (
            <div className="pt-2">
              <div
                title={collapsed ? activeModule.label : undefined}
                className={cn(
                  "relative flex h-8 items-center gap-2.5 rounded-lm-sm px-2 text-sm text-lm-ink",
                  collapsed && "lg:justify-center lg:px-0",
                  "before:absolute before:top-1.5 before:bottom-1.5 before:left-[-8px] before:w-0.5 before:rounded-lm-xs before:bg-lm-signal",
                )}
              >
                <ActiveIcon className="size-4 shrink-0 text-lm-signal-text" strokeWidth={1.5} />
                <span className={cn("truncate", collapsed && "lg:hidden")}>{activeModule.label}</span>
              </div>

              {activeModule.children ? (
                <div className={cn("mt-0.5 ml-[13px] space-y-0.5 border-l border-lm-line pl-[21px]", collapsed && "lg:hidden")}>
                  {activeModule.children.map((child) => {
                    const childActive = child.exact
                      ? pathname === child.href
                      : pathname === child.href || pathname.startsWith(`${child.href}/`);

                    const badge = badges?.[child.href];

                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        className={cn(
                          "flex h-7 items-center justify-between gap-2 rounded-lm-sm px-2 py-1.5 text-[13px] transition-colors",
                          childActive ? "text-lm-ink" : "text-lm-ink-2 hover:text-lm-ink",
                        )}
                      >
                        <span className="truncate">{child.label}</span>
                        {badge ? <span className="shrink-0 font-mono text-xs text-lm-ink-3">{badge}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ) : null}
        </nav>

        <div className={cn("space-y-0.5 border-t border-lm-line px-2 py-2", collapsed && "lg:px-2")}>
          <Link
            href="/configuracion"
            title={collapsed ? "Configuración" : undefined}
            className={cn(
              "flex h-8 items-center gap-2.5 rounded-lm-sm px-2 text-sm text-lm-ink-2 transition-colors",
              collapsed && "lg:justify-center lg:px-0",
              pathname.startsWith("/configuracion") ? "text-lm-ink" : "hover:bg-lm-raised hover:text-lm-ink",
            )}
          >
            <Settings className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn(collapsed && "lg:hidden")}>Configuración</span>
          </Link>

          <button
            type="button"
            onClick={signOut}
            title={collapsed ? "Salir" : undefined}
            className={cn(
              "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-lm-sm px-2 text-sm text-lm-ink-2 transition-colors hover:bg-lm-raised hover:text-lm-ink",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <LogOut className="size-4 shrink-0" strokeWidth={1.5} />
            <span className={cn(collapsed && "lg:hidden")}>Salir</span>
          </button>

          <div
            className={cn("flex items-center gap-2.5 px-2 pt-2", collapsed && "lg:justify-center lg:px-0")}
            title={collapsed ? name : undefined}
          >
            <ProfileAvatar url={avatarUrl} name={name} className="size-7 text-xs" />
            <span className={cn("min-w-0 flex-1 truncate text-sm text-lm-ink", collapsed && "lg:hidden")}>{name}</span>
          </div>
        </div>
      </aside>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  );
}
