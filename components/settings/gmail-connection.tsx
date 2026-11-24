"use client";

import { useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { changeGmailConnection, connectGmail } from "@/lib/mail/actions";

export function GmailConnection({ status, notice }: {
  status: { configured: boolean; ready: boolean; hasTeam: boolean; email: string | null; owner: boolean; shared: boolean; connectionId: string | null };
  notice?: string;
}) {
  const [error, setError] = useState("");
  const [busy, start] = useTransition();
  const { confirm, confirmDialog } = useConfirm();
  async function change(action: "share" | "unshare" | "disconnect") {
    if (!status.connectionId) return;
    const expected = status.connectionId;
    if (action !== "unshare" && !await confirm(action === "share" ? {
      title: "¿Compartir la casilla con tu equipo?",
      description: "Los miembros actuales podrán leer todos los mensajes, abrir adjuntos y enviar correos desde la cuenta de la empresa.",
      confirmLabel: "Compartir casilla",
    } : {
      title: "¿Desconectar la casilla?",
      description: "El equipo pierde el acceso desde SmokIA. Los mensajes siguen en Gmail.",
      confirmLabel: "Desconectar", tone: "danger",
    })) return;
    start(async () => {
      setError("");
      const result = await changeGmailConnection(action, expected);
      if (!result.ok) setError(result.error);
    });
  }
  return (
    <div className="space-y-3">
      {notice === "connected" && <p className="text-sm text-lm-success" role="status">Casilla conectada.</p>}
      {notice === "error" && <p className="text-sm text-lm-danger" role="alert">No se completó la autorización. Revisá que el equipo tenga una sola casilla y volvé a intentar con la cuenta correcta.</p>}
      {error && <p className="text-sm text-lm-danger" role="alert">{error}</p>}
      {!status.ready ? <p className="text-sm text-lm-ink-2">Correo requiere la migración de Gmail en la base de este entorno.</p>
        : !status.hasTeam ? <p className="text-sm text-lm-ink-2">La casilla se conecta desde una cuenta que pertenece a un equipo de SmokIA.</p>
        : <>
          {status.email && <div className="space-y-1">
            <p className="break-all text-sm font-semibold">{status.email}</p>
            <p className="text-sm text-lm-ink-2">{status.shared ? "Compartida con el equipo" : "Privada"}</p>
          </div>}
          {!status.configured && <p className="text-sm text-lm-ink-2">Falta configurar la autorización de Google en este entorno.</p>}
          <div className="flex flex-wrap items-center gap-2">
            {status.configured && (!status.email || status.owner) && (
              <form action={connectGmail}>
                <Button variant={status.email ? "secondary" : "primary"} type="submit" disabled={busy}>
                  {status.email ? "Volver a conectar Gmail" : "Conectar Gmail"}
                </Button>
              </form>
            )}
            {status.owner && <>
              <Button disabled={busy} onClick={() => void change(status.shared ? "unshare" : "share")}>
                {status.shared ? "Dejar de compartir" : "Compartir con mi socio"}
              </Button>
              <Button disabled={busy} variant="danger" onClick={() => void change("disconnect")}>Desconectar</Button>
            </>}
            {status.email && <ButtonLink href="/leads/correo" variant="ghost">Abrir Correo</ButtonLink>}
          </div>
        </>}
      {confirmDialog}
    </div>
  );
}
