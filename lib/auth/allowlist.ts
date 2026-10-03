/**
 * Quién puede usar la app: los mails de `ALLOWED_EMAILS` (separados por coma).
 * Los datos ya están aislados por usuario vía RLS; esto decide quién entra.
 *
 * Falla cerrado: sin la variable no entra nadie. Se chequea en el proxy (toda
 * sesión), en el callback de OAuth, en el registro y en el pedido de reset.
 */
function allowedEmails(): Set<string> {
  const raw = process.env.ALLOWED_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return allowedEmails().has(email.trim().toLowerCase());
}
