"use server";

import { revalidatePath } from "next/cache";

import { insertKnowledge, updateKnowledge } from "@/lib/leads/knowledge/mutations";
import { KnowledgePatchInput, NewKnowledgeInput, type KnowledgeCollection, type KnowledgeOrigin } from "@/lib/leads/knowledge/schema";
import { createClient, requireUser } from "@/lib/supabase/server";

export type KnowledgeActionResult = { ok: true } | { ok: false; message: string };

export interface KnowledgeFormInput {
  /** Sin id se crea una nota nueva; con id se corrige la existente. */
  id?: string;
  collection: KnowledgeCollection;
  title: string;
  body: string;
  origin: KnowledgeOrigin;
  /** Separados por espacios o comas, como se tipean. */
  tags: string;
  leadId?: string;
}

function parseTags(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, ""))
    .filter(Boolean);
}

/** Crear o corregir una nota desde la pantalla (Plan §1.18). El `data` de cada colección no se edita acá: lo escribe el modelo. */
export async function saveKnowledgeNote(input: KnowledgeFormInput): Promise<KnowledgeActionResult> {
  const user = await requireUser();

  const fields = {
    title: input.title,
    body: input.body,
    origin: input.origin,
    tags: parseTags(input.tags),
    lead_id: input.leadId || undefined,
  };

  if (input.id) {
    const parsed = KnowledgePatchInput.safeParse(fields);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los campos." };
    const result = await updateKnowledge(input.id, parsed.data);
    if (!result.ok) return { ok: false, message: result.message };
  } else {
    const parsed = NewKnowledgeInput.safeParse({ collection: input.collection, ...fields });
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Revisá los campos." };
    const result = await insertKnowledge(user.id, parsed.data);
    if (!result.ok) return { ok: false, message: result.message };
  }

  revalidatePath("/leads/conocimiento");
  return { ok: true };
}

/** Borrar es una decisión de la persona, desde la pantalla — el modelo no tiene esta capacidad (SPA §20). */
export async function deleteKnowledgeNote(id: string): Promise<KnowledgeActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("sales_knowledge").delete().eq("id", id).eq("owner_id", user.id);
  if (error) return { ok: false, message: "No se pudo borrar la nota." };

  revalidatePath("/leads/conocimiento");
  return { ok: true };
}
