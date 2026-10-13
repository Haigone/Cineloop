"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setStatus, setWishlisted } from "@/server/actions/library";

type Tab = "home" | "library" | "explore" | "wishlist";
type Card = { id: string; title: string; year: number; type: string; posterUrl: string | null };
type LibraryCard = Card & { status: string; rating: number | null; season: number | null; episode: number | null };

const NAV: { id: Tab; label: string; symbol: string }[] = [
  { id: "home", label: "Home", symbol: "⌂" },
  { id: "library", label: "Libreria", symbol: "▤" },
  { id: "explore", label: "Esplora", symbol: "⌕" },
  { id: "wishlist", label: "Wishlist", symbol: "♡" },
];

function tabUrl(tab: Tab, query = "") {
  const params = new URLSearchParams({ tab });
  if (query) params.set("q", query);
  return "/tv?" + params.toString();
}

export function TvShell({
  user, tab, query, library, wishlist, explore, wishlistIds,
}: {
  user: { displayName: string; username: string };
  tab: Tab;
  query: string;
  library: LibraryCard[];
  wishlist: Card[];
  explore: Card[];
  wishlistIds: string[];
}) {
  const router = useRouter();
  const [search, setSearch] = useState(query);
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const wishSet = useMemo(() => new Set(wishlistIds), [wishlistIds]);

  async function toggleWishlist(item: Card) {
    startTransition(async () => {
      const result = await setWishlisted(item.id, !wishSet.has(item.id));
      setNotice(result.ok ? (wishSet.has(item.id) ? "Rimosso dalla wishlist" : "Aggiunto alla wishlist") : result.error);
      if (result.ok) router.refresh();
    });
  }

  async function updateStatus(item: LibraryCard, status: "watching" | "completed") {
    startTransition(async () => {
      const result = await setStatus(item.id, status);
      setNotice(result.ok ? (status === "completed" ? "Segnato come completato" : "Ripresa della visione aggiornata") : result.error);
      if (result.ok) router.refresh();
    });
  }

  const current: (Card | LibraryCard)[] = tab === "home"
    ? library.filter((item) => item.status === "watching").slice(0, 12)
    : tab === "library" ? library
    : tab === "wishlist" ? wishlist
    : explore;

  return (
    <main className="min-h-dvh bg-[#08090d] px-6 pb-12 pt-7 text-white sm:px-10 lg:px-16">
      <header className="mx-auto flex max-w-[1600px] items-center justify-between gap-6">
        <a href="/tv" className="tv-focus rounded-xl outline-offset-8" aria-label="CineLoop TV, Home">
          <span className="text-2xl font-black tracking-tight sm:text-3xl">cine<span className="text-[#a5f36b]">loop</span></span>
          <span className="ml-3 hidden text-xs font-semibold uppercase tracking-[0.24em] text-white/45 sm:inline">TV</span>
        </a>
        <div className="text-right">
          <p className="text-sm font-semibold sm:text-base">{user.displayName}</p>
          <p className="text-xs text-white/45">@{user.username}</p>
        </div>
      </header>

      <nav aria-label="Sezioni TV" className="mx-auto mt-8 flex max-w-[1600px] flex-wrap gap-3">
        {NAV.map((item) => (
          <a key={item.id} href={tabUrl(item.id, item.id === "explore" ? query : "")}
            aria-current={tab === item.id ? "page" : undefined}
            className={"tv-focus inline-flex min-h-12 items-center gap-3 rounded-xl border px-5 text-base font-bold transition-colors sm:min-h-14 sm:px-7 sm:text-lg " + (tab === item.id ? "border-[#a5f36b] bg-[#a5f36b] text-[#10130d]" : "border-white/10 bg-white/[0.04] text-white hover:bg-white/10")}>
            <span aria-hidden className="text-xl">{item.symbol}</span>{item.label}
          </a>
        ))}
      </nav>

      <section className="mx-auto mt-10 max-w-[1600px]">
        {tab === "home" ? <>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[#a5f36b]">Bentornato</p>
          <h1 className="text-3xl font-black sm:text-5xl">Continua a guardare</h1>
          <p className="mt-3 max-w-2xl text-base text-white/55 sm:text-lg">Riprendi da dove eri rimasto. I progressi sono quelli del tuo account CineLoop.</p>
        </> : <>
          <h1 className="text-3xl font-black sm:text-5xl">{NAV.find((item) => item.id === tab)?.label}</h1>
          <p className="mt-3 text-base text-white/55 sm:text-lg">
            {tab === "library" ? "Film e serie salvati nel tuo account." : tab === "wishlist" ? "La tua lista personale, sincronizzata con il sito." : "Cerca nel catalogo e aggiungi ciò che vuoi vedere."}
          </p>
        </>}

        {tab === "explore" && <form action="/tv" method="get" className="mt-6 flex max-w-2xl gap-3">
          <input type="hidden" name="tab" value="explore" />
          <label className="sr-only" htmlFor="tv-search">Cerca film, serie e anime</label>
          <input id="tv-search" name="q" value={search} onChange={(event) => setSearch(event.target.value)}
            placeholder="Cerca film, serie e anime…"
            className="tv-focus min-h-14 min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.06] px-5 text-lg text-white placeholder:text-white/35" />
          <button className="tv-focus min-h-14 rounded-xl bg-[#a5f36b] px-6 font-bold text-[#10130d]" type="submit">Cerca</button>
        </form>}

        {tab === "home" && current.length === 0 && <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8 sm:p-12">
          <h2 className="text-2xl font-bold">Non hai episodi in corso</h2>
          <p className="mt-2 text-white/55">Apri Esplora o la Libreria per scegliere cosa guardare.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a className="tv-focus rounded-xl bg-[#a5f36b] px-5 py-3 font-bold text-[#10130d]" href={tabUrl("explore")}>Esplora il catalogo</a>
            <a className="tv-focus rounded-xl border border-white/15 px-5 py-3 font-bold" href={tabUrl("library")}>Apri libreria</a>
          </div>
        </div>}

        {tab === "library" && <div className="mt-6 flex flex-wrap gap-3">
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/75">{library.length} titoli nella libreria</span>
          <span className="rounded-full bg-white/10 px-4 py-2 text-sm text-white/75">{library.filter((item) => item.status === "watching").length} in corso</span>
        </div>}

        {pending && <p role="status" className="mt-4 text-sm text-[#a5f36b]">Sincronizzazione in corso…</p>}
        {notice && <p role="status" className="mt-4 text-sm text-[#a5f36b]">{notice}</p>}

        <div className="mt-7 grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {current.map((item) => {
            const libraryItem = (tab === "library" || tab === "home") ? item as LibraryCard : null;
            const inWishlist = wishSet.has(item.id) || tab === "wishlist";
            return <article key={item.id} className="min-w-0">
              <a href={"/title/" + encodeURIComponent(item.id)} className="tv-focus group block rounded-xl outline-offset-4">
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#26382c] to-[#171821]">
                  {item.posterUrl ? <img src={item.posterUrl} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.04]" /> :
                    <div className="flex h-full items-end p-4"><span className="text-xl font-black">{item.title}</span></div>}
                  {libraryItem && <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-xs font-bold">{libraryItem.status === "watching" ? "In corso" : libraryItem.status === "completed" ? "Completato" : libraryItem.status}</span>}
                  {libraryItem?.season && libraryItem.episode && <span className="absolute bottom-2 left-2 rounded-md bg-black/75 px-2 py-1 text-xs">S{libraryItem.season} · E{libraryItem.episode}</span>}
                </div>
              </a>
              <h2 className="mt-3 line-clamp-2 min-h-12 text-base font-bold sm:text-lg">{item.title}</h2>
              <p className="mt-1 text-sm text-white/45">{item.year} · {item.type === "movie" ? "Film" : item.type === "anime" ? "Anime" : "Serie"}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {tab !== "wishlist" && <button type="button" onClick={() => void toggleWishlist(item)} disabled={pending}
                  aria-label={(inWishlist ? "Rimuovi " : "Aggiungi ") + item.title + " " + (inWishlist ? "dalla" : "alla") + " wishlist"}
                  className="tv-focus min-h-10 rounded-lg border border-white/15 px-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">
                  {inWishlist ? "♥ In wishlist" : "♡ Wishlist"}
                </button>}
                {libraryItem && libraryItem.status !== "completed" && <button type="button" onClick={() => void updateStatus(libraryItem, "completed")} disabled={pending}
                  className="tv-focus min-h-10 rounded-lg border border-[#a5f36b]/45 px-3 text-sm font-semibold text-[#c9ffa5] hover:bg-[#a5f36b]/10 disabled:opacity-50">Visto</button>}
                {tab === "explore" && <button type="button" onClick={() => startTransition(async () => {
                  const result = await setStatus(item.id, "watching");
                  setNotice(result.ok ? "Aggiunto alla libreria" : result.error);
                  if (result.ok) router.refresh();
                })} disabled={pending} className="tv-focus min-h-10 rounded-lg border border-white/15 px-3 text-sm font-semibold hover:bg-white/10 disabled:opacity-50">Inizia</button>}
              </div>
            </article>;
          })}
        </div>
        {current.length === 0 && tab !== "home" && <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-8">
          <h2 className="text-xl font-bold">{tab === "library" ? "La libreria è vuota" : tab === "wishlist" ? "La wishlist è vuota" : query ? "Nessun risultato" : "Nessun titolo da mostrare"}</h2>
          <p className="mt-2 text-white/55">{tab === "explore" && query.length < 2 ? "Prova a cercare un titolo usando la barra qui sopra." : "Quando aggiungi dei titoli al sito, li ritroverai anche qui."}</p>
        </div>}
      </section>

      <footer className="mx-auto mt-16 max-w-[1600px] border-t border-white/10 pt-5 text-xs text-white/35">
        CineLoop TV · Account @{user.username} · Progressi sincronizzati con CineLoop
      </footer>
    </main>
  );
}
