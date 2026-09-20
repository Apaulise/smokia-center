"use client";

import { Loader2, Target } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { defineBrandGoal } from "@/lib/brand/goals/actions";
import { formatCount } from "@/lib/brand/goals/progress";
import type { BrandPlatform } from "@/lib/brand/sources/types";

const DATE_INPUT =
  "h-10 w-full rounded-[12px] border border-line bg-surface/60 px-3 text-sm text-ink disabled:opacity-40";

/**
 * Botón + diálogo para definir la meta de seguidores (Plans/03 §3.13). Redefinirla
 * archiva la anterior: el servidor garantiza que nunca haya dos activas.
 */
export function GoalDialogButton({
  platform,
  currentFollowers,
  hasActiveGoal,
  initialTarget,
  initialDeadline,
  label,
  variant = "secondary",
}: {
  platform: BrandPlatform;
  /** null si todavía no hay ningún conteo: sin él no se puede definir una meta. */
  currentFollowers: number | null;
  hasActiveGoal: boolean;
  initialTarget?: number;
  initialDeadline?: string | null;
  label: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState(initialTarget ? String(initialTarget) : "");
  const [deadline, setDeadline] = useState(initialDeadline ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    setError(null);
    const parsed = Number(target.replace(/\./g, "").replace(/\s/g, ""));
    if (!target.trim() || !Number.isFinite(parsed)) {
      setError("Poné la cantidad de seguidores que querés alcanzar.");
      return;
    }
    setBusy(true);
    const result = await defineBrandGoal(platform, { targetFollowers: parsed, deadline: deadline || null });
    setBusy(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button type="button" variant={variant} size="sm" onClick={() => setOpen(true)} disabled={currentFollowers === null}>
        <Target className="size-3.5" />
        {label}
      </Button>

      <Dialog
        open={open}
        onClose={busy ? () => undefined : () => setOpen(false)}
        title="Meta de seguidores"
        description={currentFollowers !== null ? `Hoy tenés ${formatCount(currentFollowers)} seguidores.` : undefined}
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="goal-target" className="mb-1.5 block text-xs text-muted">
              Seguidores a alcanzar
            </label>
            <Input
              id="goal-target"
              inputMode="numeric"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="10000"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="goal-deadline" className="mb-1.5 block text-xs text-muted">
              Plazo (opcional)
            </label>
            <input
              id="goal-deadline"
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className={DATE_INPUT}
            />
            <p className="mt-1 text-xs text-muted/80">Con plazo se calcula cuántos seguidores por día hacen falta.</p>
          </div>

          {hasActiveGoal ? (
            <p className="text-xs text-muted">Definir una meta nueva archiva la actual: nunca hay dos activas.</p>
          ) : null}
          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex justify-end gap-2 border-t border-line/60 pt-4">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button type="button" variant="primary" onClick={handleSubmit} disabled={busy}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Target className="size-3.5" />}
              Guardar meta
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
