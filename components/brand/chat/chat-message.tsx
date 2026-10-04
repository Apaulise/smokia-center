import { Search } from "lucide-react";
import Link from "next/link";

import { Markdown } from "@/components/brand/markdown";
import { Tag } from "@/components/brand/ui/card";
import type { BrandChatWireTurn } from "@/lib/brand/ai/chat-types";
import type { Database } from "@/lib/supabase/database.types";
import { cn } from "@/lib/utils";

type ChatMessageRow = Database["public"]["Tables"]["brand_chat_messages"]["Row"];

const TOOL_LABEL: Record<string, string> = {
  buscar_mis_posts: "Buscando en tus posts…",
  metricas_de_post: "Revisando métricas…",
  buscar_conocimiento: "Consultando la base de conocimiento…",
  guardar_conocimiento: "Guardando en la base de conocimiento…",
  actualizar_conocimiento: "Actualizando la base de conocimiento…",
  web_search: "Buscando en la web…",
  buscar_en_la_web: "Buscando en la web…",
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
  saved = false,
}: {
  row: ChatMessageRow;
  onSaveIdea?: (messageId: string, text: string) => void;
  /** Ya se guardó una idea desde esta respuesta (en esta sesión). */
  saved?: boolean;
}) {
  const isUser = row.role === "USUARIO";
  const { text, tools } = extractParts(row);
  const streaming = row.status === "EN_CURSO";

  // Sin burbujas: una etiqueta de remitente arriba y el texto suelto debajo. La persona a la derecha, el asistente sangrado bajo su marca.
  return (
    <div className={cn("flex flex-col gap-2", isUser && "items-end")}>
      <div className={cn("flex items-center gap-2", isUser && "flex-row-reverse")}>
        {isUser ? null : (
          <span className="flex size-[26px] shrink-0 items-center justify-center rounded-lm-md border border-lm-line-strong">
            <span className={cn("size-2 rounded-full bg-lm-signal", streaming && "animate-pulse")} />
          </span>
        )}
        <span className="text-xs font-semibold tracking-[0.02em] text-lm-ink-2 uppercase">{isUser ? "Tú" : "Asistente"}</span>
      </div>

      <div className={cn("flex min-w-0 max-w-full flex-col gap-2", isUser ? "items-end" : "pl-[34px]")}>
        {tools.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {tools.map((label, index) => (
              <Tag key={index}>
                <Search className="size-3" />
                {label}
              </Tag>
            ))}
          </div>
        ) : null}
        {text || streaming ? (
          <div className={cn("text-[15px] leading-[1.65] text-lm-ink", isUser && "max-w-[85%] text-right whitespace-pre-wrap")}>
            {/* Lo que escribe la persona es texto plano; lo que devuelve el modelo es markdown. */}
            {isUser ? text : <Markdown className="text-[15px] leading-[1.65]">{text}</Markdown>}
            {streaming ? <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-lm-signal align-middle" /> : null}
          </div>
        ) : null}
        {row.status === "FALLIDO" ? <p className="text-xs text-lm-danger">{row.error ?? "Algo falló generando la respuesta."}</p> : null}
        {!isUser && !streaming && text ? (
          saved ? (
            <p className="text-[13px] text-lm-success">
              ✓ Idea guardada ·{" "}
              <Link href="/marca/planificador" className="text-lm-signal-text hover:underline">
                Verla en el planificador
              </Link>
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onSaveIdea?.(row.id, text)}
              className="w-fit text-[13px] font-semibold text-lm-signal-text hover:text-lm-signal-hover hover:underline"
            >
              Guardar como idea
            </button>
          )
        ) : null}
      </div>
    </div>
  );
}
