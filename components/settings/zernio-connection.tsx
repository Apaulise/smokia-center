"use client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, ShieldCheck, Users, XCircle } from "lucide-react";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/field";
import {
  checkAccountHealthNow,
  connectZernio,
  disconnectChannelAccount,
  setChannelSharing,
  syncAccountNow,
  type ChatActionState,
} from "@/lib/chats/actions";
import type { ChannelAccountView } from "@/lib/chats/queries";
import { cn } from "@/lib/utils";

function formatSynced(iso: string | null): string {
  if (!iso) return "todavía no se sincronizó";
  return `sincronizada ${new Date(iso).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}`;
}

function AccountRow({ account, hasTeam }: { account: ChannelAccountView; hasTeam: boolean }) {
  const { confirm, confirmDialog } = useConfirm();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ChatActionState>(null);

  function run(task: () => Promise<ChatActionState>) {
    startTransition(async () => {
      setResult(await task());
    });
  }

  const broken = account.status !== "ACTIVA";

  return (
    <>
      <div className="flex flex-col gap-3 rounded-lm-sm border border-lm-line-strong bg-lm-raised px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-lm-sans text-[13.5px] font-semibold text-lm-ink">
              @{account.handle ?? account.zernio_account_id}
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-xs font-medium",
                  broken ? "text-lm-danger" : "text-lm-success",
                )}
              >
                {broken ? <XCircle className="size-3.5" strokeWidth={1.5} /> : <CheckCircle2 className="size-3.5" strokeWidth={1.5} />}
                {broken ? "Necesita reconectarse" : "Conectada"}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-lm-ink-3">
              {account.isOwner ? "Tuya" : "De tu socio, compartida con vos"} · {formatSynced(account.last_synced_at)}
              {account.shared ? " · compartida con el equipo" : ""}
            </p>
          </div>

          {account.isOwner ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => syncAccountNow(account.id))}>
                {pending ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" strokeWidth={1.5} />}
                Sincronizar
              </Button>
              <Button variant="secondary" size="sm" disabled={pending} onClick={() => run(() => checkAccountHealthNow(account.id))}>
                <ShieldCheck className="size-3.5" strokeWidth={1.5} />
                Verificar
              </Button>
              {hasTeam ? (
                <Button
                  variant={account.shared ? "secondary" : "primary"}
                  size="sm"
                  disabled={pending}
                  onClick={async () => {
                    if (
                      !account.shared &&
                      !(await confirm({
                        title: "¿Compartir el inbox con tu socio?",
                        description: "Va a poder leer todos los mensajes de esta cuenta y responder desde ALTAB. Lo podés dejar de compartir cuando quieras.",
                        confirmLabel: "Compartir",
                      }))
                    )
                      return;
                    run(() => setChannelSharing(account.id, !account.shared));
                  }}
                >
                  <Users className="size-3.5" strokeWidth={1.5} />
                  {account.shared ? "Dejar de compartir" : "Compartir con mi socio"}
                </Button>
              ) : null}
              <Button
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "¿Desconectar esta cuenta?",
                    description: "Se borran de ALTAB sus conversaciones y mensajes (en Zernio siguen) y se quita el webhook.",
                    confirmLabel: "Desconectar",
                    tone: "danger",
                  });
                  if (!ok) return;
                  run(() => disconnectChannelAccount(account.id));
                }}
              >
                Desconectar
              </Button>
            </div>
          ) : null}
        </div>

        {broken && account.status_detail ? (
          <p className="flex items-start gap-1.5 text-xs text-lm-ink-2">
            <AlertTriangle className="mt-px size-3.5 shrink-0 text-lm-signal-text" strokeWidth={1.5} />
            {account.status_detail}. Reconectala desde el dashboard de Zernio (Conexiones → Instagram) y después tocá <strong>Verificar</strong>.
          </p>
        ) : null}

        {result ? (
          <p className={cn("flex items-start gap-1.5 text-[13px]", result.ok ? "text-lm-success" : "text-lm-danger")} role="status">
            {result.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} /> : <XCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />}
            {result.message}
          </p>
        ) : null}
      </div>
      {confirmDialog}
    </>
  );
}

/**
 * La conexión del inbox con Zernio (Plans/01-inbox-omnicanal-zernio.md §1.25).
 * Se pega la API key de Zernio una vez: SmokIA valida la key, registra su propio
 * webhook firmado, guarda todo cifrado y trae el historial. La key no vuelve a
 * mostrarse ni sale del servidor.
 */
export function ZernioConnection({
  ready,
  accounts,
  hasTeam,
  webhookReachable,
}: {
  ready: boolean;
  accounts: ChannelAccountView[];
  hasTeam: boolean;
  /** `false` si NEXT_PUBLIC_APP_URL es localhost: Zernio no alcanza esa URL. */
  webhookReachable: boolean;
}) {
  const [state, action, pending] = useActionState(connectZernio, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  if (!ready) {
    return (
      <p className="text-[13px] text-lm-ink-2">
        Falta aplicar las migraciones del inbox (<code className="font-mono">20261113120000</code> y <code className="font-mono">20261113130000</code>): corré <code className="font-mono">npm run db:push</code> y <code className="font-mono">npm run db:types</code>.
      </p>
    );
  }

  const hasAccounts = accounts.length > 0;
  const ownsAny = accounts.some((account) => account.isOwner);

  return (
    <div className="flex flex-col gap-4">
      {accounts.map((account) => (
        <AccountRow key={account.id} account={account} hasTeam={hasTeam} />
      ))}

      {!webhookReachable ? (
        <p className="flex items-start gap-1.5 text-xs text-lm-ink-2">
          <AlertTriangle className="mt-px size-3.5 shrink-0 text-lm-signal-text" strokeWidth={1.5} />
          NEXT_PUBLIC_APP_URL apunta a localhost: Zernio no puede avisarte de mensajes nuevos acá. En desarrollo entran sólo al sincronizar; en producción, solos.
        </p>
      ) : null}

      {!hasAccounts || ownsAny ? (
        <form
          ref={formRef}
          action={action}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="min-w-[260px] flex-1">
            <label htmlFor="zernioApiKey" className="mb-1.5 block font-lm-sans text-[13px] font-medium text-lm-ink-2">
              {hasAccounts ? "Reemplazar API key de Zernio (por ejemplo, al reconectar)" : "API key de Zernio"}
            </label>
            <Input id="zernioApiKey" name="apiKey" type="password" autoComplete="off" placeholder="sk_••••••••••••••••" required />
          </div>
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {hasAccounts ? "Reconectar" : "Conectar"}
          </Button>
        </form>
      ) : null}

      {state ? (
        <p className={cn("flex items-start gap-1.5 text-[13px]", state.ok ? "text-lm-success" : "text-lm-danger")} role="status">
          {state.ok ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} /> : <XCircle className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />}
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
