import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { searchAniDbAnime } from "@/integrations/catalog/anidb-first";
import { SectionHeader } from "@/components/ui/section-header";

export const metadata: Metadata = { title: "Anime" };

// AniDB/database access is request-time data; do not prerender this route.
export const instant = false;

export default async function AnimeLibraryPage({ searchParams }: PageProps<"/anime">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";
  const results = query.length >= 2 ? await searchAniDbAnime(query, 16) : [];

  return (
    <div className="space-y-8">
      <SectionHeader
        as="h1"
        title="Libreria anime"
        description="Catalogo dedicato basato sugli identificativi AniDB. Serie, film e storie correlate vengono collegate tramite le relazioni fra opere."
      />
      <form action="/anime" className="flex max-w-2xl gap-2">
        <label className="sr-only" htmlFor="anime-query">Cerca anime</label>
        <input
          id="anime-query"
          name="q"
          defaultValue={query}
          placeholder="Cerca un anime per titolo o nome alternativo…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-line-strong"
        />
        <button type="submit" className="inline-flex h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm hover:bg-white/[0.05]">
          <Search aria-hidden className="size-4" /> Cerca
        </button>
      </form>

      {!query && (
        <div className="max-w-2xl rounded-xl border border-line bg-surface p-5">
          <h2 className="text-base font-semibold">Un catalogo anime separato</h2>
          <p className="mt-2 text-sm leading-relaxed text-fg-2">
            Cerca un titolo per aprire la sua scheda AniDB e consultare sequel, prequel e altre relazioni. Le relazioni non sono tutte obbligatorie: il percorso personale potrà escludere film, speciali e spin-off facoltativi.
          </p>
          <p className="mt-3 text-xs text-fg-3">Identità e relazioni: AniDB tramite animap. Metadati aggiuntivi: ANN quando è disponibile un identificativo corrispondente.</p>
        </div>
      )}

      {query && (
        <section aria-labelledby="anime-results">
          <h2 id="anime-results" className="mb-3 text-sm text-fg-2">{results.length} risultati per “{query}”</h2>
          {results.length === 0 ? (
            <p className="rounded-lg border border-line p-5 text-sm text-fg-2">Nessun risultato disponibile. La fonte può essere temporaneamente irraggiungibile o il titolo può non essere presente nell’indice.</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((anime) => (
                <li key={anime.id}>
                  <Link href={`/anime/${anime.anidbId}`} className="flex h-full gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-white/[0.025]">
                    {anime.posterUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={anime.posterUrl} alt="" loading="lazy" className="h-28 w-[74px] shrink-0 rounded-md object-cover" />
                    ) : (
                      <div aria-hidden className="h-28 w-[74px] shrink-0 rounded-md bg-white/[0.05]" />
                    )}
                    <span className="min-w-0 py-1">
                      <span className="block line-clamp-2 text-sm font-semibold">{anime.title}</span>
                      <span className="mt-1 block text-xs text-fg-3">{[anime.year, anime.format, anime.episodeCount ? `${anime.episodeCount} episodi` : null].filter(Boolean).join(" · ") || "Dettagli AniDB"}</span>
                      <span className="mt-3 block text-xs text-fg-2">Apri scheda e relazioni →</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
