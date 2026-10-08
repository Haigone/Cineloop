import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Compass, SearchX } from "lucide-react";
import { GENRES } from "@/domain/genres";
import type { Genre, MediaType } from "@/domain/types";
import { getExploreView, getForYouView, TASTE_TARGET, type ExploreFilters as Filters } from "@/server/services/explore";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { GridSkeleton } from "@/components/media/grid-skeleton";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";
import { ExploreFilters } from "@/components/explore/explore-filters";
import { TitleGrid } from "@/components/explore/title-grid";
import { TastePicker } from "@/components/explore/taste-picker";
import { TopTen } from "@/components/explore/top-ten";

const TYPE_PLURAL: Record<Filters["type"], string> = { all: "Tutto il catalogo", movie: "Tutti i film", series: "Tutte le serie", anime: "Tutti gli anime" };

export const metadata: Metadata = { title: "Esplora" };

export default function ExplorePage({ searchParams }: PageProps<"/explore">) {
  return (
    <>
      <SectionHeader as="h1" title="Esplora" description="Cerca nel catalogo o lasciati consigliare: tutto quello che trovi puoi aggiungerlo alla wishlist." />
      <Suspense fallback={<Skeleton className="h-12 rounded-xl" />}>
        <Filters searchParams={searchParams} />
      </Suspense>
      <Suspense
        fallback={
          <LoadingRegion label="Caricamento del catalogo" className="mt-8">
            <GridSkeleton label="Caricamento dei titoli" count={12} />
          </LoadingRegion>
        }
      >
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Filters({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const f = await parseFilters(searchParams);
  return <ExploreFilters q={f.q} type={f.type} genre={f.genre ?? ""} sort={f.sort} />;
}

async function Results({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const filters = await parseFilters(searchParams);
  // Searching, or narrowing by genre/order/page, is browsing: just the results.
  const browsing = filters.q.length >= 2 || filters.genre !== null || filters.sort !== "popular" || filters.page > 1;
  if (browsing) return <BrowseResults filters={filters} />;
  // Otherwise the recommendations come first (for the chosen type), then the catalog.
  return (
    <>
      <ForYou type={filters.type} />
      <section aria-labelledby="catalog-h" className="mt-12">
        <SectionHeader as="h2" title={TYPE_PLURAL[filters.type]} id="catalog-h" description="Usa genere e ordine qui sopra per restringere." />
        <BrowseResults filters={filters} bare />
      </section>
    </>
  );
}

async function BrowseResults({ filters, bare = false }: { filters: Filters; bare?: boolean }) {
  const view = await getExploreView(filters);
  const wishlistIds = new Set(view.wishlistIds);

  if (view.titles.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={<SearchX />}
          title={filters.q ? `Nessun risultato per “${filters.q}”.` : "Nessun titolo con questi filtri."}
          description={
            view.completeCatalog
              ? "Prova con meno filtri o con un altro titolo."
              : "Il catalogo di prova ha pochi titoli. Collega TMDB per cercare in tutto il catalogo."
          }
        />
      </div>
    );
  }

  const base = new URLSearchParams();
  if (filters.q) base.set("q", filters.q);
  if (filters.type !== "all") base.set("type", filters.type);
  if (filters.genre) base.set("genre", filters.genre);
  if (filters.sort !== "popular") base.set("sort", filters.sort);
  const pageHref = (page: number) => {
    const p = new URLSearchParams(base);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };

  return (
    <section className={bare ? "" : "mt-8"}>
      {!bare && <h2 className="sr-only">Risultati</h2>}
      <TitleGrid titles={view.titles} wishlistIds={wishlistIds} label="Risultati della ricerca" />
      {(view.hasMore || filters.page > 1) && (
        <nav aria-label="Pagine dei risultati" className="mt-10 flex items-center justify-center gap-4 text-sm">
          {filters.page > 1 && (
            <Link href={pageHref(filters.page - 1)} className="rounded-md border border-line-strong px-4 py-2 text-fg-2 hover:text-fg">
              Pagina precedente
            </Link>
          )}
          <span className="tabular text-fg-3">Pagina {filters.page}</span>
          {view.hasMore && (
            <Link href={pageHref(filters.page + 1)} className="rounded-md border border-line-strong px-4 py-2 text-fg-2 hover:text-fg">
              Pagina successiva
            </Link>
          )}
        </nav>
      )}
    </section>
  );
}

async function ForYou({ type }: { type: Filters["type"] }) {
  const view = await getForYouView(type);
  const wishlistIds = new Set(view.wishlistIds);
  const topLabel = view.topIsWeekly ? "Top 10 della settimana" : "Top 10 del catalogo";

  return (
    <Reveal className="mt-8 flex flex-col gap-10">
      {view.top.length > 0 && (
        <RevealItem as="section">
          <SectionHeader
            title={topLabel}
            description={view.topIsWeekly ? "I titoli più visti in questi sette giorni." : "I più votati del catalogo di prova. Con TMDB diventa la classifica della settimana."}
          />
          <TopTen titles={view.top} wishlistIds={wishlistIds} label={topLabel} />
        </RevealItem>
      )}
      {view.picker.length > 0 && (
        <RevealItem>
          <TastePicker titles={view.picker} liked={view.liked} target={TASTE_TARGET} />
        </RevealItem>
      )}
      {view.shelves.map((shelf) => (
        <RevealItem key={shelf.id} as="section">
          <SectionHeader title={shelf.title} description={shelf.description} id={`shelf-${shelf.id}`} />
          <Rail label={shelf.title}>
            {shelf.titles.map((title) => (
              <TitleCard key={title.id} title={title} wishlisted={wishlistIds.has(title.id)} />
            ))}
          </Rail>
        </RevealItem>
      ))}
      {view.shelves.length === 0 && view.picker.length === 0 && (
        <RevealItem>
          <EmptyState
            compact
            icon={<Compass />}
            title="Ancora niente “Per te” per questo tipo."
            description="Vota qualche titolo che hai visto: i consigli arrivano da lì."
          />
        </RevealItem>
      )}
    </Reveal>
  );
}

async function parseFilters(searchParams: PageProps<"/explore">["searchParams"]): Promise<Filters> {
  const sp = await searchParams;
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
  const type = one(sp.type);
  const genre = one(sp.genre);
  const sort = one(sp.sort);
  const page = Number.parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).slice(0, 80),
    type: (["movie", "series", "anime"] as const).includes(type as MediaType) ? (type as MediaType) : "all",
    genre: (GENRES as readonly string[]).includes(genre) ? (genre as Genre) : null,
    sort: sort === "top" || sort === "recent" ? sort : "popular",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 50) : 1,
  };
}

