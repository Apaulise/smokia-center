import type { Metadata } from "next";
import { Host_Grotesk, Inter, JetBrains_Mono, Sora } from "next/font/google";

import "./globals.css";

// §4 del manual: Sora en titulares, Inter en cuerpo/UI, JetBrains Mono en datos.
// Vigente para el Gestor de Marca Personal, que no se toca en este rediseño.
const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

// Sistema "Señal y humo" del Gestor de Leads: Host Grotesk en vez de
// Sora/Inter (Design System, tokens de tipografía). Se suma sin sacar los
// anteriores (Marca sigue usándolos).
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
    <html
      lang="es"
      className={`${sora.variable} ${inter.variable} ${jetbrainsMono.variable} ${hostGrotesk.variable} h-full`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
