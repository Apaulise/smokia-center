"use server";

import { revalidatePath } from "next/cache";

import { insertKnowledge, updateKnowledge } from "@/lib/brand/knowledge/mutations";
import {
  KnowledgePatchInput,
  NewKnowledgeInput,
  type KnowledgeCollection,
  type KnowledgeOrigin,
  type KnowledgeStatus,
} from "@/lib/brand/knowledge/schema";
import { createClient, requireUser } from "@/lib/supabase/server";

export type KnowledgeActionResult = { ok: true } | { ok: false; message: string };

export interface KnowledgeFormInput {
  /** Sin id se crea una nota nueva; con id se corrige la existente. */
  id?: string;
  collection: KnowledgeCollection;
  title: string;
  body: string;
  origin: KnowledgeOrigin;
  status?: KnowledgeStatus;
  /** Separados por espacios o comas, como se tipean. */
  tags: string;
}

function parseTags(raw: string) {
  return raw
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, ""))
    .filter(Boolean);
}

/**
 * Crear o corregir una nota desde la pantalla (Plans/03 §3.12). El `data` de
 * cada colección no se edita acá: lo escribe el agente, y desde la pantalla
 * se ve tal cual — esto cubre lo que se corrige a mano: título, texto,
 * origen, estado y etiquetas.
 */
export async function saveKnowledgeNote(input: KnowledgeFormInput): Promise<KnowledgeActionResult> {
  const user = await requireUser();

  const fields = {
    title: input.title,
    body: input.body,
    origin: input.origin,
    status: input.collection === "EXPERIMENTOS" ? input.status : undefined,
    tags: parseTags(input.tags),
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

  revalidatePath("/marca/conocimiento");
  return { ok: true };
}

/**
 * Borrar es una decisión de la persona, desde la pantalla. El agente no tiene
 * esta capacidad (SOC §26: "nunca borrar resultados negativos"), y a propósito
 * no hay una tool que la exponga.
 */
export async function deleteKnowledgeNote(id: string): Promise<KnowledgeActionResult> {
  await requireUser();
  const supabase = await createClient();
  const { error } = await supabase.from("brand_knowledge").delete().eq("id", id);
  if (error) return { ok: false, message: "No se pudo borrar la nota." };

  revalidatePath("/marca/conocimiento");
  return { ok: true };
}
