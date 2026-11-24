import "server-only";

import MailComposer from "nodemailer/lib/mail-composer/index.js";
import { z } from "zod";
import { gmail, mailboxSession, MailError } from "@/lib/mail/connection";
import { applyToDraftRevision, lookupPart, mailboxQuery, readMessage, replyFields, type GmailDraft, type GmailMessage, type GmailPart, type GmailThread } from "@/lib/mail/model";
import { folders, maxNewAttachmentBytes, type ComposeFields, type InboxRow, type MailChange, type MailLabel, type MailMessage, type ReplyMode } from "@/lib/mail/types";

export const mailId = z.string().min(1).max(512).regex(/^[a-zA-Z0-9_-]+$/);
export const partId = z.string().max(250).regex(/^[a-zA-Z0-9_.-]*$/);
const folderId = z.custom<(typeof folders)[number][0] | `label:${string}`>((value) =>
  typeof value === "string" && (folders.some(([id]) => id === value) || /^label:Label_[a-zA-Z0-9_]+$/.test(value)));
const metadata = "?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Date";

async function attachmentBody(token: string, messageId: string, attachmentId: string) {
  const result = await gmail<{ data?: string }>(token, `/messages/${mailId.parse(messageId)}/attachments/${mailId.parse(attachmentId)}`);
  if (typeof result.data !== "string") throw new MailError("Gmail no devolvió el adjunto.");
  return result.data;
}

async function includeExternalText(token: string, message: GmailMessage) {
  async function visit(part: GmailPart) {
    const { body, parts } = part;
    if (!part.filename && body?.attachmentId && !body.data &&
      (part.mimeType === "text/plain" || part.mimeType === "text/html")) {
      body.data = await attachmentBody(token, message.id, body.attachmentId);
    }
    if (parts) await Promise.all(parts.map(visit));
  }
  if (message.payload) await visit(message.payload);
  return message;
}

function rowFor(id: string, message: MailMessage, labels: string[], draft = false): InboxRow {
  const row = { id, labels, from: draft ? message.to : message.from, subject: message.subject,
    snippet: message.snippet, date: message.date };
  return draft ? { ...row, draft: true, draftMessageId: message.id } : { ...row, draft: false };
}

async function listRows<T, R>(entries: T[], mapper: (entry: T) => Promise<R>) {
  const rows: R[] = [];
  // Limita las lecturas simultáneas de metadata de una misma bandeja.
  for (let offset = 0; offset < entries.length; offset += 5) {
    rows.push(...await Promise.all(entries.slice(offset, offset + 5).map(mapper)));
  }
  return rows;
}

export async function fetchMailbox(connection: string, folder: unknown, query: unknown, cursor?: unknown) {
  const view = folderId.parse(folder);
  const search = z.string().max(1000).parse(query);
  const page = z.string().max(2048).optional().parse(cursor);
  const { accessToken } = await mailboxSession(connection);
  const params = mailboxQuery(view, search, page);
  const labelRequest = gmail<{ labels?: (MailLabel & { type: string })[] }>(accessToken, "/labels");
  const listRequest = async () => {
    if (view === "drafts") {
      params.delete("labelIds");
      const { drafts, nextPageToken } = await gmail<{ drafts?: GmailDraft[]; nextPageToken?: string }>(accessToken, `/drafts?${params}`);
      const rows = await listRows(drafts ?? [], async ({ id, message }) => {
        const item = await gmail<GmailMessage>(accessToken, `/messages/${mailId.parse(message.id)}${metadata}`);
        return rowFor(id, readMessage(item), ["DRAFT"], true);
      });
      return { rows, next: nextPageToken };
    }
    const { threads, nextPageToken } = await gmail<{ threads?: GmailThread[]; nextPageToken?: string }>(accessToken, `/threads?${params}`);
    const entries = await listRows(threads ?? [], async ({ id, snippet }) => {
      const thread = await gmail<GmailThread>(accessToken, `/threads/${mailId.parse(id)}${metadata}`);
      const messages = (thread.messages ?? []).map(readMessage).filter((message) => !message.labels.includes("DRAFT"));
      const labels = [...new Set(messages.flatMap((message) => message.labels))];
      if (view === "archive" && labels.includes("INBOX")) return null;
      const latest = messages.at(-1);
      return latest ? rowFor(id, { ...latest, snippet: latest.snippet || snippet || "" }, labels) : null;
    });
    return { rows: entries.filter((row) => row !== null), next: nextPageToken };
  };
  const [labelsResponse, list] = await Promise.all([labelRequest, listRequest()]);
  const labels = (labelsResponse.labels ?? []).filter((label) => label.type === "user")
    .map(({ id, name }) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  return { ...list, labels };
}

export async function fetchThread(connection: string, id: unknown) {
  const threadId = mailId.parse(id);
  const { accessToken } = await mailboxSession(connection);
  const thread = await gmail<GmailThread>(accessToken, `/threads/${threadId}?format=full`);
  const messages = (thread.messages ?? []).filter((message) => !message.labelIds?.includes("DRAFT"));
  return listRows(messages, async (message) => readMessage(await includeExternalText(accessToken, message)));
}

const mailChanges = z.enum(["read", "unread", "star", "unstar", "archive", "inbox", "trash", "restore", "label", "unlabel", "spam", "not-spam"]);
const changes: Partial<Record<MailChange, [string[], string[]]>> = {
  read: [[], ["UNREAD"]], unread: [["UNREAD"], []],
  star: [["STARRED"], []], unstar: [[], ["STARRED"]],
  archive: [[], ["INBOX"]], inbox: [["INBOX"], []],
  spam: [["SPAM"], ["INBOX"]], "not-spam": [["INBOX"], ["SPAM"]],
};

export async function modifyThread(connection: string, id: unknown, action: unknown, label?: unknown) {
  const thread = mailId.parse(id);
  const change = mailChanges.parse(action);
  const { accessToken } = await mailboxSession(connection);
  if (change === "trash" || change === "restore") {
    await gmail(accessToken, `/threads/${thread}/${change === "trash" ? "trash" : "untrash"}`, undefined, "POST");
    return;
  }
  const labelId = change === "label" || change === "unlabel" ? z.string().regex(/^Label_[a-zA-Z0-9_]+$/).parse(label) : null;
  const [addLabelIds, removeLabelIds] = labelId
    ? change === "label" ? [[labelId], []] : [[], [labelId]]
    : changes[change]!;
  await gmail(accessToken, `/threads/${thread}/modify`, { addLabelIds, removeLabelIds });
}

export async function getDraft(connection: string, id: unknown) {
  const draftId = mailId.parse(id);
  const { accessToken } = await mailboxSession(connection);
  const draft = await gmail<GmailDraft>(accessToken, `/drafts/${draftId}?format=full`);
  return readMessage(await includeExternalText(accessToken, draft.message));
}

async function getSource(token: string, id: string) {
  return gmail<GmailMessage>(token, `/messages/${id}?format=full`);
}

export async function prepareReply(connection: string, id: unknown, mode: ReplyMode) {
  const messageId = mailId.parse(id);
  const kind = z.enum(["reply", "reply-all", "forward"]).parse(mode);
  const { accessToken, email } = await mailboxSession(connection);
  const message = readMessage(await includeExternalText(accessToken, await getSource(accessToken, messageId)));
  const fields = replyFields(message, email, kind);
  const text = mode === "forward" ? [
    "", "", "---------- Mensaje reenviado ----------",
    `De: ${message.from}`, `Para: ${message.to}`, `Asunto: ${message.subject}`, "",
    message.text,
  ].join("\n") : "";
  return { to: fields.to, cc: fields.cc, subject: fields.subject, text,
    attachments: mode === "forward" ? message.attachments : [] } satisfies ComposeFields;
}

async function fileData(token: string, message: GmailMessage, id: string) {
  const part = lookupPart(message.payload, id);
  if (!part?.body || !part.filename) throw new MailError("El adjunto ya no está disponible.");
  const { attachmentId } = part.body;
  const data = attachmentId
    ? await attachmentBody(token, message.id, attachmentId)
    : part.body.data;
  if (typeof data !== "string") throw new MailError("Gmail no devolvió el adjunto.");
  return { filename: part.filename, content: Buffer.from(data, "base64url"), contentType: part.mimeType };
}

export async function getAttachment(connection: string, id: string, part: string) {
  const messageId = mailId.parse(id);
  const { accessToken } = await mailboxSession(connection);
  return fileData(accessToken, await getSource(accessToken, messageId), partId.parse(part));
}

const field = (max: number) => z.string().max(max).refine((value) => !/[\r\n\u0000]/.test(value));
const composer = z.object({
  to: field(6000), cc: field(6000), bcc: field(6000), subject: field(998), text: z.string().max(300_000),
  draft: mailId.or(z.literal("")), draftMessage: mailId.or(z.literal("")), source: mailId.or(z.literal("")),
  mode: z.enum(["", "reply", "reply-all", "forward"]),
});

const staleDraftMessage = "El borrador cambió en Gmail. Actualizá la bandeja y volvé a abrirlo.";

async function changeCurrentDraft<T>(token: string, draft: string, revision: string, change: () => Promise<T>) {
  // Gmail no ofrece una escritura condicional. La última lectura reduce la
  // ventana entre la verificación y la escritura, aun con adjuntos lentos.
  const result = await applyToDraftRevision(
    () => gmail<GmailDraft>(token, `/drafts/${draft}?format=minimal`),
    revision,
    change,
  );
  if (!result.applied) throw new MailError(staleDraftMessage);
  return result.value;
}

export async function submitMail(connection: string, form: FormData, intent: "send" | "draft") {
  const values = composer.parse(Object.fromEntries(
    ["to", "cc", "bcc", "subject", "text", "draft", "draftMessage", "source", "mode"].map((key) => [key, form.get(key) ?? ""]),
  ));
  const files = z.array(z.instanceof(File)).max(20).parse(form.getAll("file")).filter((file) => file.size > 0);
  if (files.reduce((size, file) => size + file.size, 0) > maxNewAttachmentBytes) {
    throw new MailError("Podés adjuntar hasta 3 MiB en total. Abrí Gmail para adjuntar archivos más grandes.");
  }
  const kept = z.array(partId).max(100).parse(form.getAll("keep"));
  if (intent === "send" && ![values.to, values.cc, values.bcc].some((value) => value.includes("@"))) {
    throw new MailError("Agregá al menos un destinatario válido.");
  }
  const { accessToken, email } = await mailboxSession(connection);
  const previous = values.draft
    ? (await gmail<GmailDraft>(accessToken, `/drafts/${values.draft}?format=full`)).message
    : values.source ? await getSource(accessToken, values.source) : null;
  if (values.draft && previous?.id !== values.draftMessage) throw new MailError("El borrador cambió en Gmail. Guardá una copia del texto y volvé a abrirlo.");
  if (values.source && !values.mode) throw new MailError("Elegí cómo continuar el mensaje original.");
  const prior = previous ? readMessage(values.draft ? await includeExternalText(accessToken, previous) : previous) : null;
  const isReply = Boolean(prior && (values.mode === "reply" || values.mode === "reply-all"));
  const reply = isReply && prior ? replyFields(prior, email, "reply") : null;
  const threadId = reply?.threadId ?? (values.draft && prior?.references ? prior.threadId : undefined);
  const subject = (reply?.subject ?? values.subject).replace(/[\r\n\u0000]+/g, " ").slice(0, 998);
  const oldAttachments = previous && (values.draft || values.mode === "forward")
    ? await Promise.all([...new Set(kept)].map((part) => fileData(accessToken, previous, part))) : [];
  const newAttachments = await Promise.all(files.map(async (file) => ({
    filename: file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 250) || "adjunto",
    content: Buffer.from(await file.arrayBuffer()),
  })));
  const ref = (input: string | undefined) => input?.match(/<[^< >\r\n]+>/g)?.slice(-50).join(" ") || undefined;
  const mime = new MailComposer({
    from: email, to: values.to.trim(), cc: values.cc.trim(), bcc: values.bcc.trim(),
    subject, text: values.text,
    html: values.draft && prior?.text === values.text ? prior.html || undefined : undefined,
    inReplyTo: ref(reply?.inReplyTo ?? (threadId ? previous?.payload?.headers?.find((h) => h.name.toLowerCase() === "in-reply-to")?.value : undefined)),
    references: ref(reply?.references ?? (threadId ? prior?.references : undefined)),
    attachments: [...oldAttachments, ...newAttachments], disableFileAccess: true, disableUrlAccess: true,
  }).compile();
  mime.keepBcc = true;
  const raw = (await mime.build()).toString("base64url");
  const message = { raw, ...(threadId ? { threadId } : {}) };
  if (intent === "send") {
    async function send() {
      try {
        if (values.draft) await gmail(accessToken, "/drafts/send", { id: values.draft, message });
        else await gmail(accessToken, "/messages/send", message);
      } catch {
        throw new MailError("Gmail no confirmó el envío. Revisá Enviados antes de reintentar.");
      }
    }
    if (values.draft) await changeCurrentDraft(accessToken, values.draft, values.draftMessage, send);
    else await send();
    return null;
  }
  const draft = values.draft
    ? await changeCurrentDraft(accessToken, values.draft, values.draftMessage,
      () => gmail<GmailDraft>(accessToken, `/drafts/${values.draft}`, { message }, "PUT"))
    : await gmail<GmailDraft>(accessToken, "/drafts", { message });
  return draft.id;
}

export async function removeDraft(connection: string, id: unknown, expectedMessageId: unknown) {
  const draft = mailId.parse(id);
  const revision = mailId.parse(expectedMessageId);
  const { accessToken } = await mailboxSession(connection);
  await changeCurrentDraft(accessToken, draft, revision,
    () => gmail(accessToken, `/drafts/${draft}`, undefined, "DELETE"));
}
