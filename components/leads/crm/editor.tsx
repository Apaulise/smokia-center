"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { actionSize } from "@/components/leads/crm/styles";
import type { CrmResult } from "@/lib/crm/actions";

function EditVersion({ revision }: { revision: string }) {
  const [openedWith] = useState(revision);
  return <input type="hidden" name="edit_version" value={openedWith} />;
}

export function CrmEditor({ title, description, trigger, action, submit, children, revision, primary = false }: {
  title: string;
  description?: string;
  trigger: ReactNode;
  action: (previous: CrmResult | null, form: FormData) => Promise<CrmResult>;
  submit: string;
  children: ReactNode;
  revision?: string;
  primary?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<CrmResult | null>(null);
  const [pending, start] = useTransition();
  const feedback = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (result && !result.ok) feedback.current?.focus();
  }, [result]);

  function close() {
    if (pending) return;
    setOpen(false);
  }

  return (
    <>
      <Button type="button" className={actionSize} variant={primary ? "primary" : "secondary"} onClick={() => {
        setResult(null);
        setOpen(true);
      }}>{trigger}</Button>
      {result?.ok && !open ? <span className="sr-only" role="status">{result.message}</span> : null}
      <Dialog open={open} title={title} description={description} onClose={close}>
        <form method="post" aria-label={title} className="flex flex-col gap-4" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          start(async () => {
            const next = await action(null, form);
            setResult(next);
            if (next.ok) setOpen(false);
          });
        }}>
          {revision ? <EditVersion revision={revision} /> : null}
          {children}
          {result && !result.ok ? (
            <p ref={feedback} tabIndex={-1} role="alert" className="rounded-lm-sm bg-lm-danger-soft p-3 text-sm text-lm-danger">
              {result.message}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2 border-t border-lm-line pt-4">
            <Button type="button" className={actionSize} variant="ghost" disabled={pending} onClick={close}>Cancelar</Button>
            <Button type="submit" className={actionSize} variant="primary" disabled={pending}>{pending ? "Guardando…" : submit}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
