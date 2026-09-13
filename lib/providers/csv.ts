import type { NormalizedLead } from "./types";

/**
 * CSV / manual: la red de seguridad cuando Apify falla o no hay crédito. No
 * lanza una corrida, así que no implementa `LeadSourceProvider` — no tiene
 * `buildInput` ni actor. Vive acá con su propia forma: parsear texto y mapear
 * columnas por nombre reconocido.
 */
export const CSV_PROVIDER_META = {
  id: "CSV" as const,
  label: "CSV / manual",
  description: "Parseo local con mapeo de columnas por nombre. Sin costo ni API.",
};

const HEADER_ALIASES: Record<string, keyof NormalizedLead> = {
  nombre: "name",
  name: "name",
  telefono: "phone",
  phone: "phone",
  celular: "phone",
  whatsapp: "phone",
  email: "email",
  correo: "email",
  mail: "email",
  sitio: "website",
  web: "website",
  website: "website",
  url: "website",
  direccion: "address",
  address: "address",
  ciudad: "city",
  city: "city",
  region: "region",
  provincia: "region",
  zona: "region",
  pais: "country",
  country: "country",
};

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Parser CSV simple con soporte de comillas y comas escapadas. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function parseCsv(content: string): Record<string, string>[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cells[index] ?? "").trim();
    });
    return row;
  });
}

/** Mapea una fila ya parseada. Devuelve null si no trae al menos un nombre. */
export function mapCsvRow(row: Record<string, string>): NormalizedLead | null {
  const mapped: Partial<Record<keyof NormalizedLead, string>> = {};

  for (const [header, value] of Object.entries(row)) {
    if (!value) continue;
    const field = HEADER_ALIASES[normalizeHeader(header)];
    if (field) mapped[field] = value;
  }

  if (!mapped.name) return null;

  return {
    name: mapped.name,
    phone: mapped.phone ?? null,
    email: mapped.email ?? null,
    website: mapped.website ?? null,
    address: mapped.address ?? null,
    city: mapped.city ?? null,
    region: mapped.region ?? null,
    country: mapped.country ?? null,
    sourceUrl: null,
    raw: row,
  };
}
