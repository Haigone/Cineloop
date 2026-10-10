import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Compass, SearchX } from "lucide-react";
import { GENRES } from "@/domain/genres";
import { BROWSABLE_PROVIDERS, PROVIDERS } from "@/domain/providers";
import type { Genre, MediaType, ProviderId } from "@/domain/types";
import { getExploreView, getForYouView, TASTE_TARGET, type ExploreFilters as Filters } from "@/server/services/explore";
import { getCommunityNetflixTop, getNetflixTop10, type RankedTitle } from "@/server/services/charts";
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
import { ReleaseRail } from "@/components/explore/release-rail";

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
  return <ExploreFilters q={f.q} type={f.type} genre={f.genre ?? ""} provider={f.provider ?? ""} sort={f.sort} />;
}

async function Results({ searchParams }: { searchParams: PageProps<"/explore">["searchParams"] }) {
  const filters = await parseFilters(searchParams);
  // Searching, or narrowing by genre/order/page, is browsing: just the results.
  const browsing =
    filters.q.length >= 2 || filters.genre !== null || filters.provider !== null || filters.sort !== "popular" || filters.page > 1;
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
  if (filters.provider) base.set("on", filters.provider);
  if (filters.sort !== "popular") base.set("sort", filters.sort);
  const pageHref = (page: number) => {
    const p = new URLSearchParams(base);
    if (page > 1) p.set("page", String(page));
    const qs = p.toString();
    return qs ? `/explore?${qs}` : "/explore";
  };

  return (
    <section className={bare ? "" : "mt-8"}>
      {!bare &&
        (filters.provider ? (
          <SectionHeader
            title={`${filters.type === "all" ? "Tutto" : TYPE_PLURAL[filters.type]} su ${PROVIDERS[filters.provider].name}`}
            description={
              view.completeCatalog
                ? "Incluso nell’abbonamento in Italia, secondo JustWatch. Si aggiorna ogni giorno."
                : "Nel catalogo di prova ci sono solo pochi titoli. Collega TMDB per vedere il catalogo completo del servizio."
            }
          />
        ) : (
          <h2 className="sr-only">Risultati</h2>
        ))}
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
  const [view, netflix, community] = await Promise.all([getForYouView(type), getNetflixTop10(), getCommunityNetflixTop()]);
  const ofType = (r: RankedTitle) => type === "all" || r.title.type === type;
  const netflixRows = netflix
    ? [
        { id: "netflix-film", label: "Top 10 Netflix Italia: film", rows: type === "all" || type === "movie" ? netflix.films : [] },
        { id: "netflix-tv", label: "Top 10 Netflix Italia: serie", rows: type === "movie" ? [] : netflix.tv.filter(ofType) },
      ].filter((c) => c.rows.length > 0)
    : [];
  const communityRows = community.filter(ofType);
  const wishlistIds = new Set(view.wishlistIds);
  const topLabel = view.topIsWeekly ? "Top 10 della settimana" : "Top 10 del catalogo";

  return (
    <Reveal className="mt-8 flex flex-col gap-10">
      {view.comingBack.length > 0 && (
        <RevealItem as="section">
          <SectionHeader
            title="Nuove stagioni delle tue serie"
            id="shelf-coming-back"
            description={
              view.realDates
                ? "Serie che hai visto e che tornano: ti avvisiamo il giorno dell’uscita."
                : "Date di esempio nel catalogo di prova: con TMDB sono quelle annunciate."
            }
          />
          <ReleaseRail label="Nuove stagioni delle tue serie" releases={view.comingBack} wishlistIds={wishlistIds} />
        </RevealItem>
      )}
      {view.top.length > 0 && (
        <RevealItem as="section">
          <SectionHeader
            title={topLabel}
            description={view.topIsWeekly ? "I titoli più visti in questi sette giorni." : "I più votati del catalogo di prova. Con TMDB diventa la classifica della settimana."}
          />
          <TopTen titles={view.top} wishlistIds={wishlistIds} label={topLabel} />
        </RevealItem>
      )}
      {netflixRows.map((chart) => (
        <RevealItem key={chart.id} as="section">
          <SectionHeader
            title={chart.label}
            description={`Classifica ufficiale di Netflix, settimana fino al ${formatWeek(netflix!.week)}.`}
            href="/explore?on=netflix"
            hrefLabel="Tutto Netflix"
          />
          <TopTen titles={chart.rows.map((r) => r.title)} wishlistIds={wishlistIds} label={chart.label} notes={chart.rows.map((r) => r.note)} />
        </RevealItem>
      ))}
      {communityRows.length >= 3 && (
        <RevealItem as="section">
          <SectionHeader
            title="Più visti su Netflix da chi usa CineLoop"
            description="Questa settimana, da chi ha l’estensione e condivide la propria attività."
          />
          <TopTen
            titles={communityRows.map((r) => r.title)}
            wishlistIds={wishlistIds}
            label="Più visti su Netflix da chi usa CineLoop"
            notes={communityRows.map((r) => r.note)}
          />
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
      {view.upcoming.length > 0 && (
        <RevealItem as="section">
          <SectionHeader
            title="In uscita"
            id="shelf-upcoming"
            description="Nei prossimi mesi, sulle piattaforme. Metti il cuore e ti avvisiamo quando esce."
          />
          <ReleaseRail label="In uscita" releases={view.upcoming} wishlistIds={wishlistIds} />
        </RevealItem>
      )}
      {view.seasonal.length > 0 && (
        <RevealItem as="section">
          <SectionHeader
            title="Anime delle prossime stagioni"
            id="shelf-seasonal"
            description="Dal calendario di MyAnimeList. Non sappiamo ancora su quale piattaforma arrivano in Italia."
          />
          <ReleaseRail label="Anime delle prossime stagioni" releases={view.seasonal} wishlistIds={wishlistIds} />
        </RevealItem>
      )}
      {view.atCinema.length > 0 && (
        <RevealItem as="section">
          <SectionHeader
            title="Prossimamente al cinema"
            id="shelf-cinema"
            description="Solo in sala, per ora: non sono su nessuna piattaforma."
          />
          <ReleaseRail label="Prossimamente al cinema" releases={view.atCinema} wishlistIds={wishlistIds} />
        </RevealItem>
      )}
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
  const on = one(sp.on);
  const page = Number.parseInt(one(sp.page), 10);
  return {
    q: one(sp.q).slice(0, 80),
    type: (["movie", "series", "anime"] as const).includes(type as MediaType) ? (type as MediaType) : "all",
    genre: (GENRES as readonly string[]).includes(genre) ? (genre as Genre) : null,
    provider: (BROWSABLE_PROVIDERS as string[]).includes(on) ? (on as ProviderId) : null,
    sort: sort === "top" || sort === "recent" ? sort : "popular",
    page: Number.isFinite(page) && page > 1 ? Math.min(page, 50) : 1,
  };
}


function formatWeek(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? isoDate : d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}
