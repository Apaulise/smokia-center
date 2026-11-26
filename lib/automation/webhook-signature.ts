// Firma de los webhooks de Zernio y Cal.com. El secreto vive en el entorno
// (Vercel / .env.local), nunca en el repo. Sin secreto, o con uno corto, no
// entra nadie: la misma respuesta que una firma inválida.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { verifySignature } from "@/lib/chats/webhook";

export const MIN_WEBHOOK_SECRET_LENGTH = 32;

export function readWebhookSecret(env: NodeJS.ProcessEnv, name: string): string | null {
  const value = (env[name] ?? "").trim();
  return value.length >= MIN_WEBHOOK_SECRET_LENGTH ? value : null;
}

/** El primer header con firma. `no-secret-provided` es el valor que manda Cal.com cuando el webhook no tiene secreto: se rechaza. */
export function headerSignature(headers: { get(name: string): string | null }, names: readonly string[]): string | null {
  for (const name of names) {
    const value = headers.get(name)?.trim();
    if (value && value.toLowerCase() !== "no-secret-provided") return value;
  }
  return null;
}

export function webhookAuthorized(rawBody: string, signature: string | null, secret: string | null): boolean {
  return verifySignature(rawBody, signature, secret);
}

export type WebhookGate = { ok: true; ownerId: string } | { ok: false; response: NextResponse };

/**
 * HMAC del body crudo + owner de `AUTOMATION_OWNER_ID`. Falla cerrado.
 * Zernio: `X-Zernio-Signature` (y el legado `X-Late-Signature`).
 * Cal.com: `X-Cal-Signature-256`.
 */
export function authorizeWebhook(
  request: NextRequest,
  rawBody: string,
  options: { secretEnv: string; signatureHeaders: readonly string[] },
): WebhookGate {
  const secret = readWebhookSecret(process.env, options.secretEnv);
  const signature = headerSignature(request.headers, options.signatureHeaders);
  if (!secret || !webhookAuthorized(rawBody, signature, secret)) {
    return { ok: false, response: NextResponse.json({ error: "No autorizado." }, { status: 401 }) };
  }

  const ownerId = z.uuid().safeParse(process.env.AUTOMATION_OWNER_ID ?? "");
  if (!ownerId.success) {
    return {
      ok: false,
      response: NextResponse.json({ error: "AUTOMATION_OWNER_ID no está configurado." }, { status: 500 }),
    };
  }

  return { ok: true, ownerId: ownerId.data };
}
