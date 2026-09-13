"use client";

import {
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

function isModuleActive(pathname: string, module: NavModule) {
  return pathname === module.href || pathname.startsWith(`${module.href}/`);
}

export function Sidebar({ email }: { email?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Cerrar el menú al navegar en mobile.
  useEffect(() => setOpen(false), [pathname]);

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
          "lg:flex lg:h-dvh lg:w-72 lg:shrink-0 lg:border-r",
          open ? "flex border-b" : "hidden",
        )}
      >
        <div className="hidden px-6 py-6 lg:block">
          <Link href="/leads" className="font-display text-lg font-semibold">
            Awareness <span className="text-cyan">AI</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4 lg:py-0">
          {MODULES.map((module) => {
            const Icon = ICONS[module.icon];
            const active = isModuleActive(pathname, module);

            if (!module.available) {
              return (
                <div
                  key={module.href}
                  className="flex cursor-not-allowed items-center gap-3 rounded-[12px] px-3 py-2.5 opacity-40"
                  title="Todavía no construido"
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate text-sm">{module.label}</span>
                  <span className="ml-auto shrink-0 text-[10px] tracking-wide text-muted uppercase">
                    Pronto
                  </span>
                </div>
              );
            }

            return (
              <div key={module.href}>
                <Link
                  href={module.href}
                  className={cn(
                    "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-cyan/10 text-cyan"
                      : "text-muted hover:bg-surface/60 hover:text-ink",
                  )}
                >
                  <Icon className="size-4 shrink-0" />
                  <span className="truncate">{module.label}</span>
                </Link>

                {active && module.children ? (
                  <div className="mt-1 ml-4 space-y-0.5 border-l border-line pl-3">
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

        <div className="space-y-1 border-t border-line px-3 py-4">
          <Link
            href="/configuracion"
            className={cn(
              "flex items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm transition-colors",
              pathname.startsWith("/configuracion")
                ? "bg-cyan/10 text-cyan"
                : "text-muted hover:bg-surface/60 hover:text-ink",
            )}
          >
            <Settings className="size-4 shrink-0" />
            Configuración
          </Link>

          <button
            type="button"
            onClick={signOut}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface/60 hover:text-ink"
          >
            <LogOut className="size-4 shrink-0" />
            Salir
          </button>

          {email ? (
            <p className="truncate px-3 pt-1 text-xs text-muted/70" title={email}>
              {email}
            </p>
          ) : null}
        </div>
      </aside>
    </>
  );
}
