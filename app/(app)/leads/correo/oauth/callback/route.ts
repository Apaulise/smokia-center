import { NextResponse } from "next/server";
import { completeGmailAuthorization } from "@/lib/mail/connection";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  let connected = false;
  if (code && state) {
    try {
      connected = await completeGmailAuthorization(code, state);
    } catch { /* No exponemos datos de Google ni de la sesión en la vuelta. */ }
  }
  const target = new URL("/configuracion", process.env.GMAIL_OAUTH_REDIRECT_URI || url.origin);
  target.searchParams.set("gmail", connected ? "connected" : "error");
  target.hash = "gmail";
  return NextResponse.redirect(target);
}
