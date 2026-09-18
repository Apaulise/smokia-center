import { Bot, Search, User } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { BrandChatWireTurn } from "@/lib/brand/ai/chat-types";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type ChatMessageRow = Database["public"]["Tables"]["brand_chat_messages"]["Row"];

const TOOL_LABEL: Record<string, string> = {
  buscar_mis_posts: "Buscando en tus posts…",
  metricas_de_post: "Revisando métricas…",
  web_search: "Buscando en la web…",
};

/**
 * `content` guarda uno o más "wire turns" (lib/brand/ai/chat-types.ts). Sólo
 * se muestran los de role "assistant": los de role "user" son el eco de un
 * tool_result, plomería del loop de herramientas, no algo que el humano tipeó.
 *
 * Una fila ASISTENTE puede traer más de un wire turn (una por vuelta de
 * herramientas) — se unen con un salto de línea, porque cada vuelta es una
 * respuesta separada en el tiempo, no texto continuo.
 */
function extractParts(row: ChatMessageRow): { text: string; tools: string[] } {
  const turns = (row.content as unknown as BrandChatWireTurn[] | null) ?? [];

  if (row.role === "USUARIO") {
    const text = turns
      .filter((turn) => typeof turn.content === "string")
      .map((turn) => turn.content as string)
      .join("\n\n");
    return { text, tools: [] };
  }

  let text = "";
  const tools: string[] = [];

  for (const turn of turns) {
    if (turn.role !== "assistant") continue;

    if (typeof turn.content === "string") {
      text += (text ? "\n\n" : "") + turn.content;
      continue;
    }

    let turnText = "";
    for (const block of turn.content ?? []) {
      if (!block || typeof block !== "object") continue;
      const typed = block as { type?: string; text?: string; name?: string };
      if (typed.type === "text" && typeof typed.text === "string") turnText += typed.text;
      if ((typed.type === "tool_use" || typed.type === "server_tool_use") && typed.name) {
        tools.push(TOOL_LABEL[typed.name] ?? `Usando ${typed.name}…`);
      }
    }
    if (turnText) text += (text ? "\n\n" : "") + turnText;
  }

  return { text, tools };
}

export function ChatMessage({
  row,
  onSaveIdea,
}: {
  row: ChatMessageRow;
  onSaveIdea?: (text: string) => void;
}) {
  const isUser = row.role === "USUARIO";
  const { text, tools } = extractParts(row);
  const streaming = row.status === "EN_CURSO";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full border",
          isUser ? "border-line bg-surface/60 text-muted" : "border-cyan/30 bg-cyan/10 text-cyan",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn("max-w-[80%] space-y-2", isUser && "flex flex-col items-end")}>
        {tools.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((label, index) => (
              <Badge key={index} tone="violet">
                <Search className="size-3" />
                {label}
              </Badge>
            ))}
          </div>
        ) : null}
        {text || streaming ? (
          <div
            className={cn(
              "whitespace-pre-wrap rounded-[16px] border px-4 py-3 text-sm text-ink",
              isUser ? "border-line bg-surface/60" : "border-line bg-elevated/80",
            )}
          >
            {text}
            {streaming ? <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-cyan align-middle" /> : null}
          </div>
        ) : null}
        {row.status === "FALLIDO" ? <p className="text-xs text-danger">{row.error ?? "Algo falló generando la respuesta."}</p> : null}
        {!isUser && !streaming && text ? (
          <button type="button" onClick={() => onSaveIdea?.(text)} className="text-xs text-cyan hover:underline">
            Guardar como idea
          </button>
        ) : null}
      </div>
    </div>
  );
}
