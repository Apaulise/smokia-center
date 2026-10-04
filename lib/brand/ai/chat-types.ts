/**
 * Un turno "de cable" guardado en brand_chat_messages.content. Mantiene la
 * forma de bloques (text / tool_use / tool_result) con la que nació el chat,
 * para que los hilos viejos sigan leyéndose; lib/brand/ai/chat.ts lo traduce
 * al formato de Gemini (contents/parts) al armar cada pedido.
 * Una fila `ASISTENTE` puede guardar más de uno (assistant + user con los
 * tool_result, repetido si hubo varias vueltas de herramientas) (Plans/03 §3.6).
 */
export interface BrandChatWireTurn {
  role: "user" | "assistant";
  content: string | WireBlock[];
}

export type WireBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown; signature?: string }
  | { type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }
  // Bloques de la época de Anthropic (thinking, server_tool_use, …): se ignoran al reenviar.
  | { type: string; [key: string]: unknown };

/** Definición de una herramienta propia del chat, en JSON Schema. */
export interface ChatToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
