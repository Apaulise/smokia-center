import Anthropic from "@anthropic-ai/sdk";

/** Espeja lib/meta/client.ts: un factory fino, sin estado propio. */
export function createAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({ apiKey });
}
