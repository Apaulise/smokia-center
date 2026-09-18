import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

/*
 * Estilos a mano, sin @tailwindcss/typography: los tamaños salen de los mismos
 * tokens que el resto de la app. react-markdown no renderiza HTML crudo y
 * sanea las URLs (descarta `javascript:`), así que el texto que devuelve el
 * modelo o una página de búsqueda web no puede inyectar nada.
 */
const components: Components = {
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-base text-ink first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-base text-ink first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold text-ink first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1.5 text-sm font-semibold text-ink first:mt-0">{children}</h4>,
  // `pre-line` respeta los saltos de línea simples: el modelo suele escribir
  // "Hook: …" y "Desarrollo: …" en líneas seguidas sin dejar una vacía.
  p: ({ children }) => <p className="my-2 whitespace-pre-line first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5 marker:text-muted">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5 marker:text-muted">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener" className="text-cyan underline-offset-2 hover:underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => <blockquote className="my-2 border-l-2 border-cyan/40 pl-3 text-muted">{children}</blockquote>,
  hr: () => <hr className="my-4 border-line/60" />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-[12px] border border-line bg-surface/40 p-3 text-xs">{children}</pre>
  ),
  code: ({ children }) => (
    <code className="rounded bg-surface/70 px-1 py-0.5 font-mono text-[0.85em] [pre_&]:bg-transparent [pre_&]:p-0">
      {children}
    </code>
  ),
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line px-2 py-1.5 font-medium text-muted">{children}</th>,
  td: ({ children }) => <td className="border-b border-line/40 px-2 py-1.5 align-top">{children}</td>,
};

/** Texto en markdown (GFM: tablas, listas, tachado) con el estilo de la app. Sirve en servidor y en cliente. */
export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn("text-sm leading-relaxed break-words text-ink", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
