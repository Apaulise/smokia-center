import { ContentFilters } from "@/components/brand/content/content-filters";
import { ContentLibraryGrid } from "@/components/brand/content/content-library-grid";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { getBrandContentLibrary, type ContentSortField } from "@/lib/brand/queries";
import type { Database } from "@/lib/supabase/database.types";

export const metadata = { title: "Biblioteca de contenido · Awareness AI" };

const PLATFORM = "INSTAGRAM" as const;
const SORT_FIELDS: ContentSortField[] = [
  "published_at",
  "views",
  "reel_avg_watch_time_ms",
  "reel_skip_rate",
  "saved",
  "shares",
  "new_followers",
];
const KIND_VALUES: Database["public"]["Enums"]["brand_post_kind"][] = [
  "REEL",
  "POST",
  "CARRUSEL",
  "HISTORIA",
  "VIDEO",
  "SHORT",
];

type SearchParams = { kind?: string; sort?: string; dir?: string; from?: string; to?: string };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ContenidoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const resolved = await searchParams;
  const sort = SORT_FIELDS.includes(resolved.sort as ContentSortField) ? (resolved.sort as ContentSortField) : "published_at";
  const ascending = resolved.dir === "asc";
  const kind = KIND_VALUES.includes(resolved.kind as (typeof KIND_VALUES)[number])
    ? (resolved.kind as (typeof KIND_VALUES)[number])
    : undefined;
  const dateFrom = resolved.from && DATE_RE.test(resolved.from) ? resolved.from : undefined;
  const dateTo = resolved.to && DATE_RE.test(resolved.to) ? resolved.to : undefined;

  const posts = await getBrandContentLibrary(PLATFORM, { sort, ascending, kind, dateFrom, dateTo });

  return (
    <>
      <PageHeader
        eyebrow="Gestor de Marca Personal"
        title="Biblioteca de contenido"
        description="Todo lo publicado, con sus métricas."
        action={
          <ButtonLink href="/marca" variant="ghost" size="sm">
            Volver al dashboard
          </ButtonLink>
        }
      />
      <div className="space-y-6 px-6 py-8 lg:px-10">
        <ContentFilters
          basePath="/marca/contenido"
          current={{ kind, sort, dir: ascending ? "asc" : "desc", from: dateFrom, to: dateTo }}
        />
        <ContentLibraryGrid posts={posts} />
      </div>
    </>
  );
}
