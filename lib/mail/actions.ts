"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { gmailAuthorizationUrl, MailError, updateGmailConnection } from "@/lib/mail/connection";
import { fetchMailbox, fetchThread, getDraft, modifyThread, prepareReply, removeDraft, submitMail } from "@/lib/mail/gmail";
import type { Folder, MailChange, ReplyMode, Result } from "@/lib/mail/types";

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try { return { ok: true, value: await fn() }; }
  catch (error) {
    return { ok: false, error: error instanceof MailError ? error.message : "No pudimos completar la operación. Revisá los datos o volvé a intentar." };
  }
}

export async function connectGmail() {
  const result = await run(gmailAuthorizationUrl);
  redirect(result.ok ? result.value : "/configuracion?gmail=error#gmail");
}

export async function changeGmailConnection(input: "share" | "unshare" | "disconnect", expected: string) {
  if (!["share", "unshare", "disconnect"].includes(input)) return { ok: false, error: "Acción inválida." } as const;
  const result = await run(() => updateGmailConnection(input, expected));
  if (result.ok) {
    revalidatePath("/configuracion");
    revalidatePath("/leads/correo");
  }
  return result;
}

export async function loadMailbox(connection: string, folder: Folder, query: string, cursor?: string) {
  return run(() => fetchMailbox(connection, folder, query, cursor));
}

export async function loadThread(connection: string, id: string) {
  return run(() => fetchThread(connection, id));
}

export async function changeMail(connection: string, id: string, change: MailChange, label?: string) {
  return run(() => modifyThread(connection, id, change, label));
}

export async function loadDraft(connection: string, id: string) {
  return run(() => getDraft(connection, id));
}

export async function deleteDraft(connection: string, id: string, expectedMessageId: string) {
  return run(() => removeDraft(connection, id, expectedMessageId));
}

export async function replyDetails(connection: string, id: string, mode: ReplyMode) {
  return run(() => prepareReply(connection, id, mode));
}

export async function writeMail(connection: string, form: FormData, intent: "send" | "draft") {
  if (intent !== "send" && intent !== "draft") return { ok: false, error: "Acción inválida." } as const;
  return run(() => submitMail(connection, form, intent));
}
