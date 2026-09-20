"use server";

import Anthropic from "@anthropic-ai/sdk";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { decrypt, encrypt } from "@/lib/crypto";
import { instagramProvider } from "@/lib/brand/sources/instagram";
import { generateGeminiJson } from "@/lib/gemini/client";
import { queryWindsorConnector } from "@/lib/windsor/client";
import type { LeadSource } from "@/lib/providers/types";
import { createClient, requireUser } from "@/lib/supabase/server";
import { slugify } from "@/lib/utils";

import {
  ANTHROPIC_KEY_SETTING,
  APIFY_KEY_SETTING,
  DEFAULT_INDUSTRIES,
  GEMINI_KEY_SETTING,
  WINDSOR_KEY_SETTING,
  actorOverrideKey,
} from "./constants";

export type ActionState = { ok: boolean; message: string } | null;

function firstIssue(error: z.ZodError, fallback: string) {
  return error.issues[0]?.message ?? fallback;
}

// ── Apify API key ────────────────────────────────────────────────────────

const apifyKeySchema = z.object({
  apiKey: z.string().trim().min(10, "La API key parece incompleta."),
});

export async function saveApifyKey(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = apifyKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "API key inválida.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(
    {
      owner_id: user.id,
      key: APIFY_KEY_SETTING,
      value_encrypted: encrypt(parsed.data.apiKey),
    },
    { onConflict: "owner_id,key" },
  );

  if (error) return { ok: false, message: "No se pudo guardar la key." };

  revalidatePath("/configuracion");
  return { ok: true, message: "API key guardada." };
}

export async function deleteApifyKey() {
  const supabase = await createClient();
  await supabase.from("settings").delete().eq("key", APIFY_KEY_SETTING);
  revalidatePath("/configuracion");
}

export async function testApifyConnection(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", APIFY_KEY_SETTING)
    .maybeSingle();

  if (!data) return { ok: false, message: "Todavía no cargaste una API key." };

  let apiKey: string;
  try {
    apiKey = decrypt(data.value_encrypted);
  } catch {
    return { ok: false, message: "La key guardada no se pudo leer. Volvé a cargarla." };
  }

  try {
    const response = await fetch("https://api.apify.com/v2/users/me", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!response.ok) {
      return {
        ok: false,
        message:
          response.status === 401
            ? "Apify rechazó la key. Revisala."
            : `Apify respondió ${response.status}.`,
      };
    }

    const body = (await response.json()) as { data?: { username?: string } };
    const username = body.data?.username;
    return {
      ok: true,
      message: username ? `Conectado como ${username}.` : "Conexión exitosa.",
    };
  } catch {
    return { ok: false, message: "No se pudo contactar a Apify." };
  }
}

// ── Windsor.ai API key ───────────────────────────────────────────────────

const windsorKeySchema = z.object({
  apiKey: z.string().trim().min(10, "La API key parece incompleta."),
});

export async function saveWindsorKey(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = windsorKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "API key inválida.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(
    {
      owner_id: user.id,
      key: WINDSOR_KEY_SETTING,
      value_encrypted: encrypt(parsed.data.apiKey),
    },
    { onConflict: "owner_id,key" },
  );

  if (error) return { ok: false, message: "No se pudo guardar la key." };

  revalidatePath("/configuracion");
  return { ok: true, message: "API key guardada." };
}

export async function deleteWindsorKey() {
  const supabase = await createClient();
  await supabase.from("settings").delete().eq("key", WINDSOR_KEY_SETTING);
  revalidatePath("/configuracion");
}

export async function testWindsorConnection(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", WINDSOR_KEY_SETTING)
    .maybeSingle();

  if (!data) return { ok: false, message: "Todavía no cargaste una API key." };

  let apiKey: string;
  try {
    apiKey = decrypt(data.value_encrypted);
  } catch {
    return { ok: false, message: "La key guardada no se pudo leer. Volvé a cargarla." };
  }

  try {
    // Windsor no tiene un endpoint genérico de "quién soy": se prueba contra
    // el conector de Instagram, que es el único conectado en esta fase.
    const rows = await queryWindsorConnector({
      apiKey,
      connector: instagramProvider.connector,
      fields: ["account_id"],
      maxRows: 1,
    });

    return {
      ok: true,
      message:
        rows.length > 0
          ? "Conexión exitosa."
          : "La key es válida, pero Windsor todavía no tiene ninguna cuenta de Instagram conectada.",
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo contactar a Windsor." };
  }
}

// ── Anthropic API key ────────────────────────────────────────────────────

const anthropicKeySchema = z.object({
  apiKey: z.string().trim().min(10, "La API key parece incompleta."),
});

export async function saveAnthropicKey(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = anthropicKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "API key inválida.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(
    {
      owner_id: user.id,
      key: ANTHROPIC_KEY_SETTING,
      value_encrypted: encrypt(parsed.data.apiKey),
    },
    { onConflict: "owner_id,key" },
  );

  if (error) return { ok: false, message: "No se pudo guardar la key." };

  revalidatePath("/configuracion");
  return { ok: true, message: "API key guardada." };
}

export async function deleteAnthropicKey() {
  const supabase = await createClient();
  await supabase.from("settings").delete().eq("key", ANTHROPIC_KEY_SETTING);
  revalidatePath("/configuracion");
}

export async function testAnthropicConnection(
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", ANTHROPIC_KEY_SETTING)
    .maybeSingle();

  if (!data) return { ok: false, message: "Todavía no cargaste una API key." };

  let apiKey: string;
  try {
    apiKey = decrypt(data.value_encrypted);
  } catch {
    return { ok: false, message: "La key guardada no se pudo leer. Volvé a cargarla." };
  }

  try {
    const client = new Anthropic({ apiKey });
    await client.models.retrieve("claude-opus-5");
    return { ok: true, message: "Conexión exitosa." };
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      return { ok: false, message: "Anthropic rechazó la key. Revisala." };
    }
    if (error instanceof Anthropic.APIError) {
      return { ok: false, message: `Anthropic respondió ${error.status}: ${error.message}` };
    }
    return { ok: false, message: "No se pudo contactar a Anthropic." };
  }
}

// ── Gemini API key (Plans/03 §3.14) ──────────────────────────────────────

const geminiKeySchema = z.object({
  apiKey: z.string().trim().min(10, "La API key parece incompleta."),
});

export async function saveGeminiKey(_prevState: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = geminiKeySchema.safeParse({ apiKey: formData.get("apiKey") });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "API key inválida.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(
    {
      owner_id: user.id,
      key: GEMINI_KEY_SETTING,
      value_encrypted: encrypt(parsed.data.apiKey),
    },
    { onConflict: "owner_id,key" },
  );

  if (error) return { ok: false, message: "No se pudo guardar la key." };

  revalidatePath("/configuracion");
  return { ok: true, message: "API key guardada." };
}

export async function deleteGeminiKey() {
  const supabase = await createClient();
  await supabase.from("settings").delete().eq("key", GEMINI_KEY_SETTING);
  revalidatePath("/configuracion");
}

export async function testGeminiConnection(_prevState: ActionState, _formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settings")
    .select("value_encrypted")
    .eq("key", GEMINI_KEY_SETTING)
    .maybeSingle();

  if (!data) return { ok: false, message: "Todavía no cargaste una API key." };

  let apiKey: string;
  try {
    apiKey = decrypt(data.value_encrypted);
  } catch {
    return { ok: false, message: "La key guardada no se pudo leer. Volvé a cargarla." };
  }

  try {
    // La prueba más barata que existe: una respuesta de un token contra el
    // mismo modelo que después clasifica.
    await generateGeminiJson({
      apiKey,
      system: "Respondé sólo con el JSON pedido.",
      prompt: 'Devolvé {"ok": true}.',
      schema: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] },
      maxOutputTokens: 32,
    });
    return { ok: true, message: "Conexión exitosa." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "No se pudo contactar a Gemini." };
  }
}

// ── Rubros (industries) ──────────────────────────────────────────────────

const industrySchema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto.").max(60, "Nombre muy largo."),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, "Color inválido."),
});

export async function createIndustry(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = industrySchema.safeParse({
    name: formData.get("name"),
    color: formData.get("color"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "Dato inválido.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("industries").insert({
    owner_id: user.id,
    name: parsed.data.name,
    slug: slugify(parsed.data.name),
    color: parsed.data.color,
  });

  if (error) {
    return {
      ok: false,
      message: error.code === "23505" ? "Ya existe un rubro con ese nombre." : "No se pudo crear el rubro.",
    };
  }

  revalidatePath("/configuracion");
  return { ok: true, message: "Rubro creado." };
}

export async function deleteIndustry(id: string) {
  const supabase = await createClient();
  await supabase.from("industries").delete().eq("id", id);
  revalidatePath("/configuracion");
}

export async function seedDefaultIndustries() {
  const user = await requireUser();
  const supabase = await createClient();
  await supabase.from("industries").upsert(
    DEFAULT_INDUSTRIES.map(({ name, color }) => ({
      owner_id: user.id,
      name,
      slug: slugify(name),
      color,
    })),
    { onConflict: "owner_id,slug", ignoreDuplicates: true },
  );
  revalidatePath("/configuracion");
}

// ── Plantillas de mensajes ───────────────────────────────────────────────

const templateSchema = z.object({
  name: z.string().trim().min(2, "Nombre muy corto.").max(60, "Nombre muy largo."),
  channel: z.enum(["WHATSAPP", "EMAIL"]),
  body: z.string().trim().min(1, "El mensaje no puede estar vacío.").max(2000, "Mensaje muy largo."),
});

export async function createTemplate(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    channel: formData.get("channel"),
    body: formData.get("body"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "Dato inválido.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").insert({
    owner_id: user.id,
    name: parsed.data.name,
    channel: parsed.data.channel,
    body: parsed.data.body,
  });

  if (error) return { ok: false, message: "No se pudo crear la plantilla." };

  revalidatePath("/configuracion");
  return { ok: true, message: "Plantilla creada." };
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  await supabase.from("message_templates").delete().eq("id", id);
  revalidatePath("/configuracion");
}

// ── Actores de Apify por fuente ──────────────────────────────────────────
// Sobreescriben el defaultActorId del proveedor (lib/providers/*). Se guardan
// cifrados en `settings` como el resto: no son secretos, pero la tabla no
// distingue, y así el contrato de la columna se mantiene sin excepciones.

const actorOverrideSchema = z.object({
  source: z.string().trim().min(1),
  actorId: z.string().trim().min(3, "Actor inválido."),
});

export async function saveActorOverride(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = actorOverrideSchema.safeParse({
    source: formData.get("source"),
    actorId: formData.get("actorId"),
  });
  if (!parsed.success) {
    return { ok: false, message: firstIssue(parsed.error, "Actor inválido.") };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("settings").upsert(
    {
      owner_id: user.id,
      key: actorOverrideKey(parsed.data.source as LeadSource),
      value_encrypted: encrypt(parsed.data.actorId),
    },
    { onConflict: "owner_id,key" },
  );

  if (error) return { ok: false, message: "No se pudo guardar el actor." };

  revalidatePath("/configuracion");
  return { ok: true, message: "Actor actualizado." };
}

export async function deleteActorOverride(source: LeadSource) {
  const supabase = await createClient();
  await supabase.from("settings").delete().eq("key", actorOverrideKey(source));
  revalidatePath("/configuracion");
}
