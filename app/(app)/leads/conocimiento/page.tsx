import { Button, ButtonLink } from "@/components/leads/ui/button";
import { Field, Input } from "@/components/leads/ui/field";
import { HeaderBar, PageHeading } from "@/components/leads/ui/page-header";
import { Tabs, TabLink } from "@/components/leads/ui/tabs";
import { KnowledgeList } from "@/components/leads/knowledge/knowledge-list";
import { getKnowledgeCounts, searchKnowledge } from "@/lib/leads/knowledge/queries";
import { COLLECTION_LABEL, isKnowledgeCollection, KNOWLEDGE_COLLECTIONS } from "@/lib/leads/knowledge/schema";

export const metadata = { title: "Memoria de ventas · Awareness AI" };

type SearchParams = { c?: string; q?: string };

/**
 * Memoria global de ventas (Plan §1.18, Design System §06 "Memoria de
 * ventas"): "una memoria que sólo el modelo puede leer es una caja negra" —
 * acá se lee, se corrige y se carga a mano, calcada de /marca/conocimiento.
 */
export default async function ConocimientoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolved = await searchParams;
  const counts = await getKnowledgeCounts();

  const collection = isKnowledgeCollection(resolved.c) ? resolved.c : (KNOWLEDGE_COLLECTIONS.find((c) => counts[c] > 0) ?? KNOWLEDGE_COLLECTIONS[0]);
  const text = resolved.q?.trim().slice(0, 200) || undefined;

  const notes = await searchKnowledge({ collection, text });

  return (
    <>
      <HeaderBar
        breadcrumb="Gestor de Leads / Memoria de ventas"
        meta={<ButtonLink href="/leads" variant="ghost" size="sm">Volver al dashboard</ButtonLink>}
      />

      <div className="flex flex-col gap-6 px-6 py-8 lg:px-8">
        <PageHeading
          title="Memoria de ventas"
          description="Lo que se aprendió entre leads y no se pierde: objeciones, dolores, ángulos y mensajes que funcionan."
        />

        <Tabs>
          {KNOWLEDGE_COLLECTIONS.map((c) => (
            <TabLink key={c} href={`/leads/conocimiento?c=${c}`} active={c === collection}>
              {COLLECTION_LABEL[c]} <span className="ml-1 font-mono text-xs text-lm-ink-3">{counts[c]}</span>
            </TabLink>
          ))}
        </Tabs>

        <form method="get" action="/leads/conocimiento" className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="c" value={collection} />
          <div className="w-full max-w-sm">
            <Field label={`Buscar en ${COLLECTION_LABEL[collection]}`} htmlFor="q">
              <Input id="q" name="q" defaultValue={text ?? ""} placeholder="Título o texto de la nota" />
            </Field>
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          {text ? (
            <ButtonLink href={`/leads/conocimiento?c=${collection}`} variant="ghost">
              Limpiar
            </ButtonLink>
          ) : null}
        </form>

        <KnowledgeList key={`${collection}:${text ?? ""}`} collection={collection} notes={notes} searching={Boolean(text)} />
      </div>
    </>
  );
}
