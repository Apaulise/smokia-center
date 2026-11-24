import sanitizeHtml from "sanitize-html";
import addressparser from "nodemailer/lib/addressparser/index.js";
import type { Folder, MailMessage, ReplyMode } from "./types.ts";

type Header = { name: string; value: string };
export type GmailPart = {
  partId?: string; filename?: string; mimeType?: string; headers?: Header[];
  body?: { attachmentId?: string; data?: string; size?: number };
  parts?: GmailPart[];
};
export type GmailMessage = {
  id: string; threadId: string; internalDate?: string;
  labelIds?: string[]; snippet?: string; payload?: GmailPart;
};
export type GmailThread = { id: string; snippet?: string; messages?: GmailMessage[] };
export type GmailDraft = { id: string; message: GmailMessage };

export async function applyToDraftRevision<T>(
  read: () => Promise<GmailDraft>,
  expectedMessageId: string,
  apply: () => Promise<T>,
): Promise<{ applied: true; value: T } | { applied: false }> {
  const { message } = await read();
  if (message.id !== expectedMessageId) return { applied: false };
  return { applied: true, value: await apply() };
}

export function mailboxQuery(folder: Folder, query: string, cursor?: string) {
  const params = new URLSearchParams({ maxResults: "20" });
  const system: Partial<Record<Folder, string>> = {
    inbox: "INBOX", starred: "STARRED", sent: "SENT", drafts: "DRAFT", spam: "SPAM", trash: "TRASH",
  };
  const label = folder.startsWith("label:") ? folder.slice(6) : system[folder];
  if (label) params.set("labelIds", label);
  if (folder === "trash" || folder === "spam") params.set("includeSpamTrash", "true");
  const parts = [];
  if (folder === "archive") parts.push("-in:inbox -in:drafts");
  if (query.trim()) parts.push(`(${query.trim()})`);
  if (parts.length) params.set("q", parts.join(" "));
  if (cursor) params.set("pageToken", cursor);
  return params;
}

export function lookupPart(part: GmailPart | undefined, id: string): GmailPart | undefined {
  if (!part) return undefined;
  if ((part.partId ?? "") === id && part.filename) return part;
  for (const child of part.parts ?? []) {
    const match = lookupPart(child, id);
    if (match) return match;
  }
}

function partText(part: GmailPart) {
  const bytes = Buffer.from(part.body?.data ?? "", "base64url");
  const contentType = part.headers?.find((header) => header.name.toLowerCase() === "content-type")?.value ?? "";
  const charset = contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? "utf-8";
  try { return new TextDecoder(charset).decode(bytes); } catch { return bytes.toString("utf8"); }
}

export function safeMailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: ["p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "blockquote",
      "ul", "ol", "li", "table", "thead", "tbody", "tr", "td", "th", "pre", "code",
      "h1", "h2", "h3", "h4", "hr", "a"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["https", "http", "mailto"],
    allowProtocolRelative: false,
    transformTags: { a: (tagName, attribs) => ({
      tagName, attribs: { ...( /^(https?:\/\/|mailto:)/i.test(attribs.href ?? "") ? { href: attribs.href } : {}),
        target: "_blank", rel: "noopener noreferrer" },
    }) },
  });
}

function fallbackPlainText(html: string) {
  let output = "";
  sanitizeHtml(html, {
    allowedTags: [],
    textFilter(text, tagName) {
      output += text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      if (tagName === "p" || tagName === "div") output += "\n";
      return text;
    },
  });
  return output.trim();
}

export function readMessage(message: GmailMessage): MailMessage {
  const header = (name: string) => message.payload?.headers?.find((h) => h.name.toLowerCase() === name)?.value ?? "";
  const attachments: MailMessage["attachments"] = [];
  const plain: string[] = [];
  const rich: string[] = [];
  function visit(part: GmailPart) {
    if (part.filename && (part.body?.attachmentId || part.body?.data)) {
      attachments.push({ partId: part.partId ?? "", name: part.filename, size: part.body.size ?? 0 });
      return;
    }
    if (part.body?.data) {
      if (part.mimeType === "text/plain") plain.push(partText(part));
      if (part.mimeType === "text/html") rich.push(partText(part));
    }
    part.parts?.forEach(visit);
  }
  if (message.payload) visit(message.payload);
  const html = safeMailHtml(rich.join("\n"));
  return { id: message.id, threadId: message.threadId, from: header("from"), to: header("to"),
    cc: header("cc"), bcc: header("bcc"), replyTo: header("reply-to"), messageId: header("message-id"),
    references: header("references"), subject: header("subject"), date: Number(message.internalDate) || 0,
    labels: message.labelIds ?? [], snippet: message.snippet ?? "", text: plain.join("\n") || fallbackPlainText(html),
    html, attachments };
}

const addresses = (value: string) => addressparser(value, { flatten: true }).flatMap((item) =>
  "address" in item && item.address ? [item.address] : []);

export function replyFields(message: MailMessage, mailbox: string, mode: ReplyMode) {
  if (mode === "forward") {
    return { to: "", cc: "", subject: /^(fwd?|rv):/i.test(message.subject) ? message.subject : `Fwd: ${message.subject}` };
  }
  const own = mailbox.toLowerCase();
  const seen = new Set([own]);
  const dedupe = (list: string[]) => list.filter((address) => {
    const key = address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const to = dedupe(addresses(message.replyTo || message.from));
  if (!to.length) to.push(...dedupe(addresses(message.to)));
  const cc = mode === "reply-all" ? dedupe(addresses(message.to).concat(addresses(message.cc))) : [];
  const references = [message.references.trim(), message.messageId.trim()].filter(Boolean).join(" ");
  return { to: to.join(", "), cc: cc.join(", "), subject: /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`,
    inReplyTo: message.messageId, references, threadId: message.threadId };
}
