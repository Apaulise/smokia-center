import "server-only";

import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cache } from "react";
import { asMail } from "@/lib/mail/db";
import { decrypt, encrypt } from "@/lib/crypto";
import { createClient, getCurrentUser, requireUser } from "@/lib/supabase/server";

const scope = "https://www.googleapis.com/auth/gmail.modify";
const api = "https://gmail.googleapis.com/gmail/v1/users/me";
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");

export class MailError extends Error {}

type ConnectionKey = { team_id: string; owner_id: string; membership_id: string; connection_id: string; email: string };

const connectionBinding = (row: ConnectionKey) => JSON.stringify([
  "gmail-refresh-v1", row.team_id, row.owner_id, row.membership_id, row.connection_id, row.email,
]);
const attemptBinding = (user: string, session: string, membership: string, state: string) =>
  JSON.stringify(["gmail-oauth-v1", user, session, membership, state]);

function boundRefreshToken(row: ConnectionKey & { refresh_token_encrypted: string }) {
  try {
    return decrypt(row.refresh_token_encrypted, connectionBinding(row));
  } catch {
    throw new MailError("La conexión de Gmail necesita volver a autorizarse.");
  }
}

function config() {
  const id = process.env.GMAIL_OAUTH_CLIENT_ID;
  const secret = process.env.GMAIL_OAUTH_CLIENT_SECRET;
  const redirect = process.env.GMAIL_OAUTH_REDIRECT_URI;
  return id && secret && redirect ? { id, secret, redirect } : null;
}

const context = cache(async () => {
  const user = await requireUser();
  const db = asMail(await createClient());
  const { data: membership, error } = await db.from("team_members")
    .select("id,team_id").eq("owner_id", user.id).maybeSingle();
  if (error) throw new MailError("No pudimos comprobar tu equipo.");
  return { user, db, membership };
});

export async function mailboxStatus() {
  const configured = Boolean(config() && process.env.APP_ENCRYPTION_KEY);
  const empty = { configured, ready: true, hasTeam: false, email: null, owner: false, shared: false, connectionId: null };
  if (!await getCurrentUser()) return empty;
  try {
    const { user, db, membership } = await context();
    if (!membership) return empty;
    const { data, error } = await db.from("gmail_mailboxes")
      .select("email,owner_id,shared,connection_id").eq("team_id", membership.team_id).maybeSingle();
    return { configured, ready: !error, hasTeam: true, email: data?.email ?? null,
      owner: data?.owner_id === user.id, shared: data?.shared ?? false, connectionId: data?.connection_id ?? null };
  } catch {
    return { ...empty, ready: false };
  }
}

export async function gmailAuthorizationUrl() {
  const oauth = config();
  if (!oauth || !process.env.APP_ENCRYPTION_KEY) throw new MailError("Falta configurar la conexión de Google.");
  const { user, db, membership } = await context();
  if (!membership) throw new MailError("Necesitás pertenecer a un equipo del CRM.");
  if (!user.sessionId) throw new MailError("Volvé a iniciar sesión para conectar Gmail.");
  const current = await mailboxStatus();
  if (current.email && !current.owner) throw new MailError("Tu equipo ya tiene una casilla conectada.");

  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const stateHash = digest(state);
  const attempt = {
    membership_id: membership.id, session_id: user.sessionId, state_hash: stateHash,
    verifier_encrypted: encrypt(verifier, attemptBinding(user.id, user.sessionId, membership.id, stateHash)),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
  const { error } = await db.from("gmail_oauth_attempts").upsert({ owner_id: user.id, ...attempt });
  if (error) throw new MailError("No pudimos iniciar la conexión. Verificá la migración de Correo.");

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: oauth.id, redirect_uri: oauth.redirect, response_type: "code", scope, state,
    access_type: "offline", prompt: "consent select_account", code_challenge: digest(verifier),
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

async function tokens(parameters: Record<string, string>) {
  const oauth = config();
  if (!oauth) throw new MailError("La integración de Google necesita configuración.");
  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", cache: "no-store", signal: AbortSignal.timeout(12_000),
    body: new URLSearchParams({ client_id: oauth.id, client_secret: oauth.secret, ...parameters }),
  });
  if (result.status === 400 || result.status === 401) throw new MailError("Google rechazó la autorización. Volvé a conectar Gmail desde Configuración.");
  if (!result.ok) throw new MailError("Google no respondió. Probá de nuevo en un momento.");
  return await result.json() as { access_token?: string; refresh_token?: string; scope?: string };
}

export async function completeGmailAuthorization(code: string, state: string) {
  const oauth = config();
  if (!oauth || !/^[A-Za-z0-9_-]{43}$/.test(state) || !code || code.length > 2048) return false;
  const { user, db, membership } = await context();
  if (!membership || !user.sessionId) return false;
  const stateHash = digest(state);
  const { data: attempt, error } = await db.from("gmail_oauth_attempts").delete()
    .eq("owner_id", user.id).eq("state_hash", stateHash).eq("membership_id", membership.id)
    .eq("session_id", user.sessionId)
    .gt("expires_at", new Date().toISOString()).select("verifier_encrypted").maybeSingle();
  if (error || !attempt) return false;
  const result = await tokens({ code, grant_type: "authorization_code", redirect_uri: oauth.redirect,
    code_verifier: decrypt(attempt.verifier_encrypted, attemptBinding(user.id, user.sessionId, membership.id, stateHash)) });
  if (!result.access_token || !result.refresh_token || !result.scope?.split(" ").includes(scope)) return false;
  const { emailAddress: email } = await gmail<{ emailAddress: string }>(result.access_token, "/profile");
  if (!email || !/^[^\s@]+@gmail\.com$/i.test(email)) return false;
  const { data: existing } = await db.from("gmail_mailboxes").select("owner_id,email,connection_id")
    .eq("team_id", membership.team_id).maybeSingle();
  const details = { team_id: membership.team_id, owner_id: user.id, membership_id: membership.id,
    connection_id: randomUUID(), email };
  const refresh_token_encrypted = encrypt(result.refresh_token, connectionBinding(details));
  if (existing) {
    if (existing.owner_id !== user.id) return false;
    const { data, error } = await db.from("gmail_mailboxes")
      .update({ email, connection_id: details.connection_id, refresh_token_encrypted, ...(existing.email !== email ? { shared: false } : {}) })
      .eq("team_id", membership.team_id).eq("owner_id", user.id).eq("connection_id", existing.connection_id).select("team_id").maybeSingle();
    return !error && Boolean(data);
  }
  const { error: insertError } = await db.from("gmail_mailboxes").insert({
    ...details, refresh_token_encrypted, shared: false,
  });
  return !insertError;
}

export async function updateGmailConnection(action: "share" | "unshare" | "disconnect", expected: string) {
  const { user, db, membership } = await context();
  if (!membership) throw new MailError("Ya no pertenecés al equipo.");
  const address = { owner: user.id, team: membership.team_id };
  if (action === "disconnect") {
    const { data, error } = await db.from("gmail_mailboxes").delete()
      .eq("team_id", address.team).eq("owner_id", address.owner).eq("connection_id", expected).select("*").maybeSingle();
    if (error || !data) throw new MailError("No pudimos desconectar la casilla.");
    try {
      await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", cache: "no-store",
        signal: AbortSignal.timeout(5_000), body: new URLSearchParams({ token: boundRefreshToken(data) }) });
    } catch { /* La conexión local ya fue eliminada. */ }
    return;
  }
  const { data, error } = await db.from("gmail_mailboxes").update({ shared: action === "share" })
    .eq("team_id", address.team).eq("owner_id", address.owner).eq("connection_id", expected).select("team_id").maybeSingle();
  if (error || !data) throw new MailError("No pudimos guardar el acceso compartido.");
}

export const mailboxSession = cache(async (expected: string) => {
  const { db, membership } = await context();
  if (!membership) throw new MailError("No hay una casilla disponible para tu equipo.");
  if (typeof expected !== "string" || !/^[a-fA-F0-9-]{36}$/.test(expected)) throw new MailError("Volvé a abrir Correo para actualizar la conexión.");
  const { data, error } = await db.from("gmail_mailboxes").select("*")
    .eq("team_id", membership.team_id).eq("connection_id", expected).maybeSingle();
  if (error || !data) throw new MailError("La conexión cambió o dejó de estar disponible. Volvé a abrir Correo.");
  const result = await tokens({ grant_type: "refresh_token", refresh_token: boundRefreshToken(data) });
  if (!result.access_token) throw new MailError("No se pudo renovar el acceso a Gmail.");
  return { accessToken: result.access_token, email: data.email };
});

export async function gmail<T>(token: string, path: string, body?: unknown, method = body === undefined ? "GET" : "POST") {
  const result = await fetch(api + path, {
    method, cache: "no-store", signal: AbortSignal.timeout(15_000),
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (result.status === 401 || result.status === 403) throw new MailError("Gmail rechazó el acceso. Revisá los permisos en Configuración.");
  if (result.status === 429) throw new MailError("Gmail recibió demasiadas consultas. Esperá un momento y volvé a intentar.");
  if (result.status === 404) throw new MailError("Gmail ya no tiene disponible ese elemento.");
  if (!result.ok) throw new MailError("Gmail no pudo completar la operación.");
  return (result.status === 204 ? undefined : await result.json()) as T;
}
