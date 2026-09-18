import { ChevronDown, Lightbulb } from "lucide-react";
import Link from "next/link";

import { Markdown } from "@/components/brand/markdown";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getBrandContentItems } from "@/lib/brand/queries";
import type { Database } from "@/lib/supabase/database.types";

export const metadata = { title: "Ideas guardadas · Awareness AI" };

const PLATFORM = "INSTAGRAM" as const;

type Item = Database["public"]["Tables"]["brand_content_items"]["Row"];

const KIND_LABEL: Record<Item["kind"], string> = {
  REEL: "Reel",
  POST: "Post",
  CARRUSEL: "Carrusel",
  HISTORIA: "Historia",
  VIDEO: "Video",
  SHORT: "Short",
};

// Violeta = proceso (manual §9): una idea es algo en camino, no un resultado.
const STATUS_LABEL: Record<Item["status"], string> = {
  IDEA: "Idea",
  GUION: "Guion",
  GRABADO: "Grabado",
  EDITADO: "Editado",
  LISTO: "Listo",
  PUBLICADO: "Publicado",
};
const STATUS_TONE: Record<Item["status"], BadgeTone> = {
  IDEA: "violet",
  GUION: "violet",
  GRABADO: "violet",
  EDITADO: "violet",
  LISTO: "cyan",
  PUBLICADO: "positive",
};

/** La vista previa de la lista es texto corrido: se le sacan los símbolos de markdown para que no se lea `**así**`. */
function plainPreview(markdown: string | null) {
  return (markdown ?? "").replace(/[#*_`>|~-]+/g, " ").replace(/\s+/g, " ").trim();
}

export default async function IdeasPage() {
  const items = await getBrandContentItems(PLATFORM);

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title="Ideas guardadas"
        description="Lo que guardaste desde el chat de generación."
        action={
          <ButtonLink href="/marca/generar" variant="ghost" size="sm">
            Ir al chat
          </ButtonLink>
        }
      />

      <div className="space-y-4 px-6 py-8 lg:px-10">
        {items.length === 0 ? (
          <EmptyState
            icon={<Lightbulb className="size-5" />}
            title="Todavía no guardaste ninguna idea"
            description="Charlá con el asistente y usá “Guardar como idea” debajo de una respuesta: queda acá."
            action={
              <ButtonLink href="/marca/generar" variant="primary">
                Ir al chat
              </ButtonLink>
            }
          />
        ) : (
          items.map((item) => {
            const preview = plainPreview(item.idea ?? item.script ?? item.caption);
            return (
              <details key={item.id} className="group rounded-[20px] border border-line bg-elevated/70">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-6 py-4 [&::-webkit-details-marker]:hidden">
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="cyan">{KIND_LABEL[item.kind]}</Badge>
                      <Badge tone={STATUS_TONE[item.status]}>{STATUS_LABEL[item.status]}</Badge>
                      <time dateTime={item.created_at} className="text-xs text-muted">
                        {new Date(item.created_at).toLocaleDateString("es-AR")}
                      </time>
                    </div>
                    <h3 className="text-base text-ink">{item.title}</h3>
                    {preview ? <p className="line-clamp-2 text-sm text-muted group-open:hidden">{preview}</p> : null}
                  </div>
                  <ChevronDown className="mt-1 size-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                </summary>

                <div className="space-y-4 border-t border-line/60 px-6 py-5">
                  {item.idea ? <Markdown>{item.idea}</Markdown> : null}
                  {item.script ? (
                    <div>
                      <h4 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Guion</h4>
                      <Markdown>{item.script}</Markdown>
                    </div>
                  ) : null}
                  {item.caption ? (
                    <div>
                      <h4 className="mb-1.5 text-xs font-medium tracking-wide text-muted uppercase">Caption</h4>
                      <Markdown>{item.caption}</Markdown>
                    </div>
                  ) : null}
                  {item.hashtags.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.hashtags.map((tag) => (
                        <Badge key={tag} tone="violet">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {item.source_thread_id ? (
                    <Link href={`/marca/generar?hilo=${item.source_thread_id}`} className="inline-block text-sm text-cyan hover:underline">
                      Ver la conversación de origen
                    </Link>
                  ) : null}
                </div>
              </details>
            );
          })
        )}
      </div>
    </>
  );
}
