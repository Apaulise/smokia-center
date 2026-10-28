import { AnalyzeOutputSchema, type AnalyzeOutput } from "@/lib/leads/ai/schemas";
import type { Json } from "@/lib/supabase/database.types";

export type ResponseType = "AUTORESPUESTA" | "HUMANA";

export type MessageAnalysisDetails = {
  analysis: AnalyzeOutput;
  aiResponseType: ResponseType;
  effectiveResponseType: ResponseType;
  reviewedAt: string | null;
};

type ReviewRecord = {
  ai_response_type?: unknown;
  reviewed_response_type?: unknown;
  reviewed_at?: unknown;
};

function isResponseType(value: unknown): value is ResponseType {
  return value === "AUTORESPUESTA" || value === "HUMANA";
}

/** Lee análisis históricos y los nuevos que incluyen revisión humana. */
export function messageAnalysisDetails(value: Json | null): MessageAnalysisDetails | null {
  const parsed = AnalyzeOutputSchema.safeParse(value);
  if (!parsed.success) return null;

  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const review = ("classification_review" in raw ? raw.classification_review : null) as ReviewRecord | null;
  const effectiveResponseType = parsed.data.analysis.response_type;

  return {
    analysis: parsed.data,
    aiResponseType: isResponseType(review?.ai_response_type) ? review.ai_response_type : effectiveResponseType,
    effectiveResponseType,
    reviewedAt: typeof review?.reviewed_at === "string" ? review.reviewed_at : null,
  };
}

/** Conserva la clasificación original de la IA aunque el usuario la cambie varias veces. */
export function withReviewedResponseType(value: Json | null, responseType: ResponseType, reviewedAt: string): Json | null {
  const details = messageAnalysisDetails(value);
  if (!details) return null;
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};

  return {
    ...raw,
    ...details.analysis,
    analysis: { ...details.analysis.analysis, response_type: responseType },
    classification_review: {
      ai_response_type: details.aiResponseType,
      reviewed_response_type: responseType,
      reviewed_at: reviewedAt,
    },
  } as Json;
}
