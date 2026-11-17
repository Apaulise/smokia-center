import type { Metadata } from "next";
import { Host_Grotesk, JetBrains_Mono } from "next/font/google";

import { NavigationProgress } from "@/components/shell/navigation-progress";
import { THEME_INIT_SCRIPT, ThemeSync } from "@/components/shell/theme-toggle";

import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

/*
 * Dos familias y nada más: Host Grotesk para toda la interfaz y JetBrains Mono
 * para números, fechas y datos (CLAUDE.md §6). Sora e Inter, del manual viejo,
 * se sacaron el 2026-11-17: ya no las usaba ninguna pantalla y eran dos
 * descargas más en cada carga.
 */
const hostGrotesk = Host_Grotesk({
  variable: "--font-host-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "SmokIA",
  description: "Panel de gestión de SmokIA",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script de tema cambia `data-theme` antes de hidratar.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} ${hostGrotesk.variable} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <ThemeSync />
        <NavigationProgress />
        {children}
      </body>
    </html>
  );
}
