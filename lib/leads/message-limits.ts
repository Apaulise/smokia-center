export type LeadMessageChannel = "WHATSAPP" | "EMAIL" | "INSTAGRAM";

export const SHORT_MESSAGE_MAX_LENGTH = 600;
export const EMAIL_MESSAGE_MAX_LENGTH = 3_000;

export function leadMessageLimit(channel: LeadMessageChannel): number {
  return channel === "EMAIL" ? EMAIL_MESSAGE_MAX_LENGTH : SHORT_MESSAGE_MAX_LENGTH;
}

export function leadMessageLimitError(channel: LeadMessageChannel): string {
  const label = channel === "EMAIL" ? "email" : channel === "INSTAGRAM" ? "Instagram" : "WhatsApp";
  const limit = leadMessageLimit(channel);
  return `El mensaje por ${label} puede tener hasta ${limit === 3_000 ? "3.000" : limit} caracteres.`;
}
