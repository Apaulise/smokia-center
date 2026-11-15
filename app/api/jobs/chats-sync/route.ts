// ⚠️ SERVICE ROLE — saltea RLS (CLAUDE.md §4). Cron de reparación del inbox:
// vuelve a leer de Zernio las conversaciones de cada cuenta conectada y trae lo
// que un webhook perdido haya dejado afuera (la propia documentación de Zernio
// recomienda re-barrer en vez de confiar en una sola pasada). Es idempotente.
//
// Protegido por CRON_SECRET, igual que /api/jobs/reconcile. En el plan Hobby de
// Vercel corre una vez por día: es un extra, el camino principal es el webhook.

import { NextResponse, type NextRequest } from "next/server";

import { asChats } from "@/lib/chats/db";
import { syncChannelAccount, type AccountContext } from "@/lib/chats/ingest";
import { syncContactTags } from "@/lib/chats/tags";
import { decrypt } from "@/lib/crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const db = asChats(createAdminClient());
  const { data: accounts } = await db
    .from("channel_accounts")
    .select("id, owner_id, team_id, channel, zernio_account_id")
    .eq("status", "ACTIVA");

  const summary: Array<{ account: string; conversations: number; messages: number; pending: number; error: string | null }> = [];

  for (const account of accounts ?? []) {
    const { data: secret } = await db
      .from("channel_secrets")
      .select("api_key_encrypted")
      .eq("channel_account_id", account.id)
      .eq("owner_id", account.owner_id)
      .maybeSingle();
    if (!secret) continue;

    let apiKey: string;
    try {
      apiKey = decrypt(secret.api_key_encrypted);
    } catch {
      summary.push({ account: account.id, conversations: 0, messages: 0, pending: 0, error: "No se pudo leer la API key." });
      continue;
    }

    const context: AccountContext = {
      id: account.id,
      ownerId: account.owner_id,
      teamId: account.team_id,
      zernioAccountId: account.zernio_account_id,
      channel: account.channel,
    };
    const result = await syncChannelAccount(db, context, apiKey);
    // §1.26: las etiquetas de Zernio, por si se perdió algún webhook de contacto.
    if (!result.error) await syncContactTags(db, context, apiKey);
    summary.push({
      account: account.id,
      conversations: result.conversations,
      messages: result.messages,
      pending: result.pending,
      error: result.error,
    });
  }

  return NextResponse.json({ accounts: summary.length, summary });
}
