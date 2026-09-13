/** Reemplaza las variables de una plantilla de mensaje (Plan §1.3 / §0.5). */
export function resolveTemplate(
  body: string,
  vars: { nombre: string; rubro?: string | null; ciudad?: string | null },
): string {
  return body
    .replaceAll("{{nombre}}", vars.nombre)
    .replaceAll("{{rubro}}", vars.rubro ?? "")
    .replaceAll("{{ciudad}}", vars.ciudad ?? "");
}

/** wa.me sólo acepta dígitos (con código de país, sin "+" ni separadores). */
export function buildWhatsappLink(phone: string, message: string): string {
  const digits = phone.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function buildMailtoLink(email: string, subject: string, body: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
