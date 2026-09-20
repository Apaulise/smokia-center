"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { saveBrandContentIdea } from "@/lib/brand/actions";
import { extractHashtags } from "@/lib/brand/insights";
import { CONTENT_OBJECTIVES, OBJECTIVE_LABEL, type ContentObjective } from "@/lib/brand/planner/schema";
import type { BrandPlatform } from "@/lib/brand/sources/types";
import type { Database } from "@/lib/supabase/database.types";

type BrandPostKind = Database["public"]["Enums"]["brand_post_kind"];
type Objective = ContentObjective;

const KIND_OPTIONS: { value: BrandPostKind; label: string }[] = [
  { value: "REEL", label: "Reel" },
  { value: "POST", label: "Post" },
  { value: "CARRUSEL", label: "Carrusel" },
  { value: "HISTORIA", label: "Historia" },
  { value: "VIDEO", label: "Video" },
  { value: "SHORT", label: "Short" },
];

/**
 * Se remonta con una `key` distinta por cada mensaje (ver chat-panel.tsx) —
 * así el estado interno arranca de cero para cada idea sin lógica aparte de
 * "resetear si cambió el texto de origen".
 */
export function SaveIdeaDialog({
  open,
  initialText,
  platform,
  threadId,
  onClose,
  onSaved,
}: {
  open: boolean;
  initialText: string;
  platform: BrandPlatform;
  threadId: string | null;
  onClose: () => void;
  /** Se llama sólo si la idea se guardó de verdad, justo antes de cerrar. */
  onSaved?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [idea, setIdea] = useState(initialText);
  const [hashtags, setHashtags] = useState(() => extractHashtags(initialText).join(" "));
  const [kind, setKind] = useState<BrandPostKind>("REEL");
  const [objective, setObjective] = useState<Objective | "">("");
  const [hypothesis, setHypothesis] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const result = await saveBrandContentIdea({
      threadId,
      platform,
      kind,
      title,
      idea,
      hashtags: hashtags.split(/\s+/).filter(Boolean),
      objective: objective || null,
      hypothesis,
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    onSaved?.();
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title="Guardar como idea" description="Queda en la bandeja “Sin fecha” del planificador.">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs text-muted">Título</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Un nombre corto para encontrarla después" autoFocus />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted">Tipo</label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as BrandPostKind)}>
            {KIND_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
          <div>
            <label className="mb-1.5 block text-xs text-muted">Objetivo</label>
            <Select value={objective} onChange={(e) => setObjective(e.target.value as Objective | "")}>
              <option value="">Sin definir</option>
              {CONTENT_OBJECTIVES.map((value) => (
                <option key={value} value={value}>
                  {OBJECTIVE_LABEL[value]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <label className="mb-1.5 block text-xs text-muted">Hipótesis</label>
            <Textarea
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              placeholder="Probamos si [formato] aplicado a [tema] mediante [ángulo] rinde mejor porque […]"
              className="min-h-20"
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted">Idea / guion</label>
          <Textarea value={idea} onChange={(e) => setIdea(e.target.value)} className="min-h-40" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs text-muted">Hashtags</label>
          <Input value={hashtags} onChange={(e) => setHashtags(e.target.value)} placeholder="#reels #marca" />
        </div>
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button type="button" variant="primary" onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
            Guardar
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
