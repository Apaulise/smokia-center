// ⚠️ SERVICE ROLE — API de automatización. Ver lib/automation/auth.ts y CLAUDE.md §4.
//
// POST /api/automation/leads/:id/opening-message[?regenerate=true] — la
// apertura de WhatsApp del lead, con el mismo generador que "Generar
// apertura" de la ficha (lib/leads/ai/opening.ts).
//
// La app no guarda borradores: una apertura sólo queda en `lead_messages`
// cuando se confirma como enviada. Por eso:
//   · si el lead YA tiene una apertura enviada, se devuelve esa
//     (`source: "sent"`) y no se gasta una llamada a Groq — salvo ?regenerate=true;
//   · si no, se genera una nueva (`source: "generated"`). Para que cuente como
//     apertura de la IA (antisesgo de ángulos, §1.19) hay que reportar el envío
//     con POST .../contact incluyendo { opening: { angle, variant, generated_content } }.

import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { authorizeAutomation, automationError } from "@/lib/automation/auth";
import { whatsappLinkFor } from "@/lib/automation/leads";
import { generateOpeningForAutomation } from "@/lib/automation/opening";
import { normalizePhone } from "@/lib/leads/dedupe";
import { createAdminClient } from "@/lib/supabase/admin";

// Groq suele contestar en pocos segundos, pero el plan Hobby corta a los 60.
export const maxDuration = 60;

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = authorizeAutomation(request);
  if (!auth.ok) return auth.response;

  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return automationError(400, "Lead inválido.");

  const regenerate = ["true", "1"].includes(request.nextUrl.searchParams.get("regenerate") ?? "");
  const admin = createAdminClient();

  if (!regenerate) {
    const { data: sent, error } = await admin
      .from("lead_messages")
      .select("id, content, angle, variant, channel, occurred_at, leads!inner(id, phone)")
      .eq("owner_id", auth.ownerId)
      .eq("lead_id", id)
      .eq("sender", "VENDEDOR")
      .eq("kind", "APERTURA")
      .eq("confirmed", true)
      .order("occurred_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (sent) {
      return NextResponse.json({
        leadId: id,
        source: "sent",
        alreadySent: true,
        message: sent.content,
        angle: sent.angle,
        variant: sent.variant,
        channel: sent.channel,
        sentAt: sent.occurred_at,
        phoneE164: normalizePhone(sent.leads.phone),
        whatsappLink: whatsappLinkFor(sent.leads.phone, sent.content),
      });
    }
  }

  const result = await generateOpeningForAutomation(admin, auth.ownerId, id);
  if (!result.ok) return automationError(result.status, result.message);

  const { opening, lead } = result;
  return NextResponse.json({
    leadId: id,
    source: "generated",
    alreadySent: false,
    message: opening.message,
    objective: opening.objective,
    question: opening.question,
    angle: opening.angle,
    variant: opening.variant,
    angleReason: opening.angleReason,
    phoneE164: normalizePhone(lead.phone),
    whatsappLink: whatsappLinkFor(lead.phone, opening.message),
    // Listo para pegar en POST .../contact (como `opening`) si se manda sin editar o editado.
    contactOpening: { angle: opening.angle, variant: opening.variant, generated_content: opening.message },
  });
}
