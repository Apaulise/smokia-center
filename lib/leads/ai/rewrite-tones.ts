/**
 * Los tres tonos de reescritura (Plan §1.15, SPA §24), separados de
 * `rewrite.ts` a propósito: ese archivo importa `sales-os.ts` (`readFileSync`,
 * sólo Node) y el SDK de Anthropic, así que un componente cliente que
 * necesite sólo la lista de tonos —para dibujar los botones— no puede
 * importarlo sin arrastrar todo eso al bundle del navegador.
 */
export const REWRITE_TONES = ["MAS_CORTO", "MAS_INFORMAL", "MAS_DIRECTO"] as const;
export type RewriteTone = (typeof REWRITE_TONES)[number];
