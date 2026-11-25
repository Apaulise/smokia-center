import Image from "next/image";

/*
 * Logos oficiales de las integraciones que usa el panel (public/brand/). Son
 * identidades de terceros, no parte de la paleta de SmokIA: se muestran con
 * sus colores originales y no con tokens `lm-` (CLAUDE.md §6 aplica a la UI,
 * no a logos de otra marca). Los PNG ya vienen recortados y con fondo
 * transparente.
 */

type BrandIconProps = { className?: string; strokeWidth?: number };

/** `strokeWidth` se acepta para que el logo sea intercambiable con un ícono de la barra; los logos no lo usan. */
const SIZE = 128;

/** Instagram: el marco degradado con lente y punto. */
export function InstagramIcon({ className }: BrandIconProps) {
  return <Image src="/brand/instagram.png" alt="" width={SIZE} height={SIZE} className={className} aria-hidden />;
}

/** Gmail: la M de cuatro colores. */
export function GmailIcon({ className }: BrandIconProps) {
  return <Image src="/brand/gmail.png" alt="" width={SIZE} height={SIZE} className={className} aria-hidden />;
}

/** Google Calendar: el "31" con la franja de colores. */
export function GoogleCalendarIcon({ className }: BrandIconProps) {
  return <Image src="/brand/google-calendar.png" alt="" width={SIZE} height={SIZE} className={className} aria-hidden />;
}
