import { Search } from "lucide-react";
import Link from "next/link";

import { KnowledgeList } from "@/components/brand/knowledge/knowledge-list";
import { Crumbs } from "@/components/brand/ui/card";
import { HeaderBar } from "@/components/leads/ui/page-header";
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
      <HeaderBar
        breadcrumb={<Crumbs items={[{ label: "Marca personal" }, { label: "Base de conocimiento" }]} />}
        meta={
          <Link href="/marca/generar" className="font-lm-sans text-xs text-lm-ink-2 transition-colors hover:text-lm-signal-text">
            Ir al chat →
          </Link>
        }
      />

      {/* La `key` reinicia el estado (nota abierta, diálogo) al cambiar de colección o de búsqueda. */}
      <KnowledgeList
        key={`${collection}:${text ?? ""}`}
        collection={collection}
        notes={notes}
        searching={Boolean(text)}
        heading={
          <>
            <h1 className="font-lm-sans text-[28px] leading-8 font-medium tracking-[-0.02em]">Base de conocimiento</h1>
            <p className="text-[13px] text-lm-ink-2">
              Lo que el sistema aprendió y no se pierde entre conversaciones. Cada nota dice de dónde salió.
            </p>
          </>
        }
        search={
          <form method="get" action="/marca/conocimiento" role="search">
            <input type="hidden" name="c" value={collection} />
            <label className="flex h-8 w-[260px] items-center gap-2 rounded-lm-sm border border-lm-line-strong px-2.5 text-lm-ink-3 focus-within:border-lm-signal focus-within:shadow-[0_0_0_3px_var(--color-lm-signal-soft)]">
              <Search className="size-[13px] shrink-0" />
              <input
                name="q"
                defaultValue={text ?? ""}
                placeholder={`Buscar en ${COLLECTION_LABEL[collection]}`}
                aria-label={`Buscar en ${COLLECTION_LABEL[collection]}`}
                className="min-w-0 flex-1 bg-transparent font-lm-sans text-[12.5px] text-lm-ink outline-none placeholder:text-lm-ink-3"
              />
            </label>
          </form>
        }
        tabs={
          <nav aria-label="Colecciones" className="flex gap-5 overflow-x-auto border-b border-lm-line text-[13px]">
            {KNOWLEDGE_COLLECTIONS.map((c) => {
              const active = c === collection;
              return (
                <Link
                  key={c}
                  href={`/marca/conocimiento?c=${c}`}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "relative -mb-px flex shrink-0 gap-1.5 pb-3 transition-colors",
                    active ? "font-medium text-lm-ink" : "text-lm-ink-2 hover:text-lm-ink",
                  )}
                >
                  {COLLECTION_LABEL[c]}
                  <span className="font-mono text-[11px] font-normal text-lm-ink-3">{counts[c]}</span>
                  <span className={cn("absolute right-0 -bottom-px left-0 h-0.5", active ? "bg-lm-ink" : "bg-transparent")} />
                </Link>
              );
            })}
          </nav>
        }
      />
    </>
  );
}
