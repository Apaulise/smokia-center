export const folders = [
  ["inbox", "Recibidos"], ["starred", "Destacados"], ["sent", "Enviados"],
  ["drafts", "Borradores"], ["all", "Todos"], ["archive", "Archivados"],
  ["spam", "Spam"], ["trash", "Papelera"],
] as const;

export const maxNewAttachmentBytes = 3 * 1024 * 1024;
export type Folder = (typeof folders)[number][0] | `label:${string}`;
export type MailLabel = { id: string; name: string };
export type Attachment = { partId: string; name: string; size: number };
export type MailMessage = {
  id: string; threadId: string; from: string; to: string; cc: string; bcc: string;
  replyTo: string; messageId: string; references: string; subject: string;
  date: number; labels: string[]; snippet: string; text: string;
  html: string; attachments: Attachment[];
};
export type InboxRow = {
  id: string; from: string; subject: string; snippet: string;
  date: number; labels: string[];
} & ({ draft: false } | { draft: true; draftMessageId: string });
export type MailList = { rows: InboxRow[]; next?: string; labels: MailLabel[] };
export type ReplyMode = "reply" | "reply-all" | "forward";
export type ComposeFields = { to: string; cc: string; bcc?: string; subject: string; text: string; attachments?: Attachment[] };
export type MailChange = "read" | "unread" | "star" | "unstar" | "archive" | "inbox" | "trash" | "restore" | "label" | "unlabel" | "spam" | "not-spam";
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
