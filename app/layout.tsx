import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, JetBrains_Mono } from "next/font/google";

import { NavigationProgress } from "@/components/shell/navigation-progress";
import { THEME_INIT_SCRIPT, ThemeSync } from "@/components/shell/theme-toggle";

import "./globals.css";

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const hankenGrotesk = Hanken_Grotesk({
  variable: "--font-hanken-grotesk",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "ALTAB", template: "%s · ALTAB" },
  description: "Panel de gestión de ALTAB AI Consulting",
  applicationName: "ALTAB",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: el script de tema cambia `data-theme` antes de hidratar.
    <html
      lang="es"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} ${hankenGrotesk.variable} h-full`}
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
