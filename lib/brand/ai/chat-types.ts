import type Anthropic from "@anthropic-ai/sdk";

/**
 * Un turno "de cable": la forma exacta que espera `messages` de Anthropic.
 * Una fila `ASISTENTE` de `brand_chat_messages` puede guardar más de uno
 * (assistant + user con el tool_result, quizás repetido si hubo varias
 * vueltas de herramientas) — así el historial se reenvía tal cual salió y
 * entró de la API, sin reconstruir bloques a mano (Plans/03 §3.6).
 */
export interface BrandChatWireTurn {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
}
