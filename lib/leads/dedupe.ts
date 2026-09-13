import type { NormalizedLead } from "@/lib/providers/types";
import { slugify } from "@/lib/utils";

/**
 * Prioridad: teléfono normalizado → dominio del sitio → source_url → slug de
 * nombre+ciudad (CLAUDE.md §4 / Plan §1.1). Es lo que hace que reimportar la
 * misma zona enriquezca los leads existentes en vez de duplicarlos.
 */
export function computeDedupeKey(lead: NormalizedLead): string {
  const phone = normalizePhone(lead.phone);
  if (phone) return `phone:${phone}`;

  const domain = extractDomain(lead.website);
  if (domain) return `domain:${domain}`;

  if (lead.sourceUrl?.trim()) return `url:${lead.sourceUrl.trim().toLowerCase()}`;

  return `slug:${slugify(`${lead.name}-${lead.city ?? ""}`)}`;
}

/**
 * Heurística, no libphonenumber: alcanza con ser consistente para deduplicar,
 * no con ser E.164 estricto. Asume Argentina si no viene código de país.
 */
function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;

  const hasPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 6) return null;

  if (hasPlus) return `+${digits}`;
  if (digits.startsWith("54")) return `+${digits}`;
  return `+54${digits.replace(/^0/, "")}`;
}

function extractDomain(website: string | null | undefined): string | null {
  if (!website?.trim()) return null;
  try {
    const url = new URL(website.includes("://") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
