import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Compass, SearchX } from "lucide-react";
import { GENRES } from "@/domain/genres";
import type { Genre, MediaType } from "@/domain/types";
import { getExploreView, getForYouView, type ExploreFilters as Filters } from "@/server/services/explore";
import { EmptyState } from "@/components/ui/empty-state";
import { Reveal, RevealItem } from "@/components/ui/reveal";
import { SectionHeader } from "@/components/ui/section-header";
import { LoadingRegion, Skeleton } from "@/components/ui/skeleton";
import { GridSkeleton } from "@/components/media/grid-skeleton";
import { Rail } from "@/components/media/rail";
import { TitleCard } from "@/components/media/title-card";
import { ExploreFilters } from "@/components/explore/explore-filters";
import { TitleGrid } from "@/components/explore/title-grid";

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
  const browsing = filters.q.length >= 2 || filters.genre !== null || filters.type !== "all" || filters.sort !== "popular" || filters.page > 1;
  return browsing ? <BrowseResults filters={filters} /> : <ForYou />;
}

async function BrowseResults({ filters }: { filters: Filters }) {
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
    <section className="mt-8">
      <h2 className="sr-only">Risultati</h2>
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

async function ForYou() {
  const view = await getForYouView();
  const wishlistIds = new Set(view.wishlistIds);

  if (view.shelves.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={<Compass />}
          title="Il catalogo non è ancora disponibile."
          description="Riprova tra un momento, oppure cerca un titolo dalla barra qui sopra."
        />
      </div>
    );
  }

  return (
    <Reveal className="mt-8 flex flex-col gap-10">
      {view.cold && (
        <RevealItem>
          <p className="rounded-xl border border-line bg-surface px-5 py-4 text-sm text-fg-2">
            Aggiungi qualche titolo che hai già visto e dagli un voto: da lì in poi questa pagina si costruisce sui tuoi gusti.
          </p>
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

