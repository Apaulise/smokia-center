"use client";

import {
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LogOut,
  Menu,
  Receipt,
  Settings,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { MODULES, type NavModule } from "@/components/shell/nav";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

const ICONS = {
  panel: LayoutGrid,
  leads: Users,
  facturacion: Receipt,
  marca: Sparkles,
} as const;

const COLLAPSE_STORAGE_KEY = "awareness-ai:sidebar-collapsed";

function isModuleActive(pathname: string, module: NavModule) {
  return pathname === module.href || pathname.startsWith(`${module.href}/`);
}

export function Sidebar({ email }: { email?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Arranca sin colapsar en el primer render (server y cliente deben coincidir
  // para no romper hydration) y se ajusta a lo persistido recién en el efecto.
  const [collapsed, setCollapsed] = useState(false);

  // Cerrar el menú al navegar en mobile.
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (localStorage.getItem(COLLAPSE_STORAGE_KEY) === "true") {
      setCollapsed(true);
    }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem(COLLAPSE_STORAGE_KEY, String(next));
      return next;
    });
  }

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      {/* Barra superior — sólo mobile */}
      <header className="flex items-center justify-between border-b border-line px-4 py-3 lg:hidden">
        <span className="font-display text-sm font-semibold tracking-wide">
          Awareness AI
        </span>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="rounded-[12px] border border-line p-2 text-muted"
          aria-label={open ? "Cerrar menú" : "Abrir menú"}
          aria-expanded={open}
        >
          {open ? <X className="size-4" /> : <Menu className="size-4" />}
        </button>
      </header>

      <aside
        className={cn(
          "flex-col border-line bg-elevated/40 backdrop-blur-sm",
          "lg:sticky lg:top-0 lg:flex lg:h-dvh lg:shrink-0 lg:border-r lg:transition-[width] lg:duration-200",
          collapsed ? "lg:w-[76px]" : "lg:w-72",
          open ? "flex border-b" : "hidden",
        )}
      >
        <div
          className={cn(
            "hidden items-center px-6 py-6 lg:flex",
            collapsed ? "lg:justify-center lg:px-3" : "lg:justify-between",
          )}
        >
          {collapsed ? null : (
            <Link href="/leads" className="font-display text-lg font-semibold">
              Awareness <span className="text-cyan">AI</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            className="flex shrink-0 items-center justify-center rounded-[10px] border border-line p-1.5 text-muted transition-colors hover:bg-surface/60 hover:text-ink"
            aria-label={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
            title={collapsed ? "Expandir barra lateral" : "Colapsar barra lateral"}
          >
            {collapsed ? (
              <ChevronRight className="size-4" />
            ) : (
              <ChevronLeft className="size-4" />
            )}
          </button>
        </div>

        <nav
          className={cn(
            "flex-1 space-y-1 overflow-y-auto px-3 py-4 lg:py-0",
            collapsed && "lg:px-2",
          )}
        >
          {MODULES.map((module) => {
            const Icon = ICONS[module.icon];
            const active = isModuleActive(pathname, module);

            if (!module.available) {
              return (
                <div
                  key={module.href}
                  className={cn(
                    "flex cursor-not-allowed items-center gap-3 rounded-[12px] px-3 py-2.5 opacity-40",
                    collapsed && "lg:justify-center lg:px-0",
                  )}
                  title={
                    collapsed
                      ? `${module.label} — Pronto`
                      : "Todavía no construido"
                  }
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={cn("truncate text-sm", collapsed && "lg:hidden")}>
                    {module.label}
                  </span>
                  <span
                    className={cn(
                      "ml-auto shrink-0 text-[10px] tracking-wide text-muted uppercase",
                      collapsed && "lg:hidden",
                    )}
                  >
                    Pronto
                  </span>
                </div>
              );
            }

            return (
              <div key={module.href}>
                <Link
                  href={module.href}
                  title={collapsed ? module.label : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm transition-colors",
                    collapsed && "lg:justify-center lg:px-0",
                    active
                      ? "bg-cyan/10 text-cyan"
                      : "text-muted hover:bg-surface/60 hover:text-ink",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className={cn("truncate", collapsed && "lg:hidden")}>
                    {module.label}
                  </span>
                </Link>

                {active && module.children ? (
                  <div
                    className={cn(
                      "mt-1 ml-4 space-y-0.5 border-l border-line pl-3",
                      collapsed && "lg:hidden",
                    )}
                  >
                    {module.children.map((child) => {
                      const childActive = child.exact
                        ? pathname === child.href
                        : pathname === child.href ||
                          pathname.startsWith(`${child.href}/`);

                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "block rounded-[10px] px-3 py-1.5 text-sm transition-colors",
                            childActive
                              ? "text-ink"
                              : "text-muted hover:text-ink",
                          )}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div
          className={cn(
            "space-y-1 border-t border-line px-3 py-4",
            collapsed && "lg:px-2",
          )}
        >
          <Link
            href="/configuracion"
            title={collapsed ? "Configuración" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm transition-colors",
              collapsed && "lg:justify-center lg:px-0",
              pathname.startsWith("/configuracion")
                ? "bg-cyan/10 text-cyan"
                : "text-muted hover:bg-surface/60 hover:text-ink",
            )}
          >
            <Settings className="size-4 shrink-0" />
            <span className={cn(collapsed && "lg:hidden")}>Configuración</span>
          </Link>

          <button
            type="button"
            onClick={signOut}
            title={collapsed ? "Salir" : undefined}
            className={cn(
              "flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink",
              collapsed && "lg:justify-center lg:px-0",
            )}
          >
            <LogOut className="size-4 shrink-0" />
            <span className={cn(collapsed && "lg:hidden")}>Salir</span>
          </button>

          {email ? (
            <p
              className={cn(
                "truncate px-3 pt-1 text-xs text-muted/70",
                collapsed && "lg:hidden",
              )}
              title={email}
            >
              {email}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
