import Link from "next/link";

import { KnowledgeList } from "@/components/brand/knowledge/knowledge-list";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getKnowledgeCounts, searchKnowledge } from "@/lib/brand/knowledge/queries";
import { COLLECTION_LABEL, isKnowledgeCollection, KNOWLEDGE_COLLECTIONS } from "@/lib/brand/knowledge/schema";
import { cn } from "@/lib/utils";

export const metadata = { title: "Base de conocimiento · Awareness AI" };

type SearchParams = { c?: string; q?: string };

export default async function ConocimientoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolved = await searchParams;
  const counts = await getKnowledgeCounts();

  // Sin colección en la URL se abre la primera que tiene algo: entrar y ver una pestaña vacía no dice nada.
  const collection = isKnowledgeCollection(resolved.c)
    ? resolved.c
    : (KNOWLEDGE_COLLECTIONS.find((c) => counts[c] > 0) ?? KNOWLEDGE_COLLECTIONS[0]);
  const text = resolved.q?.trim().slice(0, 200) || undefined;

  const notes = await searchKnowledge({ collection, text });

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title="Base de conocimiento"
        description="Lo que el sistema aprendió y no se pierde entre conversaciones. Cada nota dice de dónde salió."
        action={
          <ButtonLink href="/marca/generar" variant="ghost" size="sm">
            Ir al chat
          </ButtonLink>
        }
      />

      <div className="space-y-6 px-6 py-8 lg:px-10">
        <nav aria-label="Colecciones" className="flex flex-wrap gap-2">
          {KNOWLEDGE_COLLECTIONS.map((c) => (
            <Link
              key={c}
              href={`/marca/conocimiento?c=${c}`}
              aria-current={c === collection ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                c === collection
                  ? "border-cyan/40 bg-cyan/10 text-cyan"
                  : "border-line bg-elevated/60 text-muted hover:border-cyan/30 hover:text-ink",
              )}
            >
              {COLLECTION_LABEL[c]}
              <span className="tabular text-xs opacity-70">{counts[c]}</span>
            </Link>
          ))}
        </nav>

        <form method="get" action="/marca/conocimiento" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="c" value={collection} />
          <div className="w-full max-w-sm">
            <label className="mb-1.5 block text-xs text-muted" htmlFor="q">
              Buscar en {COLLECTION_LABEL[collection]}
            </label>
            <Input id="q" name="q" defaultValue={text ?? ""} placeholder="Título o texto de la nota" />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          {text ? (
            <ButtonLink href={`/marca/conocimiento?c=${collection}`} variant="ghost">
              Limpiar
            </ButtonLink>
          ) : null}
        </form>

        {/* La `key` reinicia el estado del diálogo al cambiar de colección o de búsqueda. */}
        <KnowledgeList key={`${collection}:${text ?? ""}`} collection={collection} notes={notes} searching={Boolean(text)} />
      </div>
    </>
  );
}
