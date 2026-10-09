/**
 * Genera un archivo .ics (RFC 5545) con los turnos de la agenda, para
 * exportar y sumar al calendario del celular (Plan §1.5).
 *
 * Es una exportación puntual, no una suscripción en vivo: no hay una URL
 * pública sin sesión que un calendario externo pueda pollear — eso
 * requeriría saltear RLS fuera de webhook/cron, que CLAUDE.md §4 reserva
 * como la única excepción. El usuario descarga el archivo y lo importa.
 */

export interface IcsAppointment {
  id: string;
  title: string;
  notes: string | null;
  starts_at: string;
  ends_at: string;
  meeting_url: string | null;
  status: string;
  leadName: string | null;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Pliega líneas a 75 octetos, como pide el RFC — si no, algunos clientes las truncan. */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = " " + rest.slice(75);
  }
  chunks.push(rest);
  return chunks.join("\r\n");
}

function formatIcsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const ICS_STATUS: Record<string, string> = {
  AGENDADA: "CONFIRMED",
  CONFIRMADA: "CONFIRMED",
  REALIZADA: "CONFIRMED",
  NO_ASISTIO: "CONFIRMED",
  CANCELADA: "CANCELLED",
};

export function buildIcsCalendar(appointments: IcsAppointment[]): string {
  const now = formatIcsDate(new Date().toISOString());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SmokIA//Gestor de Leads//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  for (const appt of appointments) {
    const descriptionParts = [appt.leadName ? `Lead: ${appt.leadName}` : null, appt.notes].filter(Boolean);

    lines.push(
      "BEGIN:VEVENT",
      `UID:${appt.id}@smokia`,
      `DTSTAMP:${now}`,
      `DTSTART:${formatIcsDate(appt.starts_at)}`,
      `DTEND:${formatIcsDate(appt.ends_at)}`,
      `SUMMARY:${escapeIcsText(appt.title)}`,
      `STATUS:${ICS_STATUS[appt.status] ?? "CONFIRMED"}`,
    );
    if (descriptionParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeIcsText(descriptionParts.join(" — "))}`);
    }
    if (appt.meeting_url) {
      lines.push(`URL:${escapeIcsText(appt.meeting_url)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}
