import type { Genre, SeasonSummary, Series, WatchPart } from "@/domain/types";
import { FRANCHISE_RELATIONS, type AnnClient } from "./ann";
import { quickListOf, type FillerList } from "./filler-list";
import type { AnimeEntry } from "./types";

/** At most this many entries and request rounds are followed from one starting point. */
const MAX_ENTRIES = 40;
const MAX_ROUNDS = 5;
/** Filler only exists for long-running shows: don't ask about a 12-episode series. */
const FILLER_MIN_EPISODES = 26;

export const ANIME_ID = /^anime-ann-(\d+)$/;
export const animeId = (annId: string) => `anime-ann-${annId}`;

export interface Franchise {
  title: Series;
  entries: Map<string, AnimeEntry>;
}

type Kind = WatchPart["kind"];

/** A TV series or a long ONA is a season; films, OVAs and specials are their own kind. */
export function kindOf(e: AnimeEntry): Kind {
  const t = e.type.toLowerCase();
  if (t === "movie") return "movie";
  if (t === "oav" || t === "ova") return "ova";
  if (t === "ona") return (e.episodes ?? 0) >= 8 ? "season" : "ova";
  if (t === "tv") return "season";
  return "special";
}

const RECAP = /recap|summary|digest|総集編|compilation/i;

const GENRES: Record<string, Genre> = {
  action: "Azione",
  adventure: "Avventura",
  comedy: "Commedia",
  drama: "Dramma",
  fantasy: "Fantasy",
  horror: "Horror",
  mystery: "Mistero",
  romance: "Romance",
  "science fiction": "Fantascienza",
  thriller: "Thriller",
};

/**
 * The entries of one franchise: everything linked to the starting ones, in
 * either direction. ANN often records a link on the newer entry only (a sequel
 * says "prequel: Bleach" while Bleach says nothing), so entries already in hand
 * (`known`, e.g. from a title search) count when they point at a member.
 */
export async function collectEntries(seeds: readonly string[], ann: AnnClient, known: readonly AnimeEntry[] = []): Promise<Map<string, AnimeEntry>> {
  const all = new Map(known.map((e) => [e.id, e]));
  const asked = new Set(all.keys());
  const linksOf = (e: AnimeEntry) => e.related.filter((r) => FRANCHISE_RELATIONS.has(r.rel)).map((r) => r.id);
  const members = () => {
    const out = new Set<string>(seeds.filter((id) => all.has(id)));
    for (let grew = true; grew; ) {
      grew = false;
      for (const e of all.values()) {
        if (out.has(e.id)) {
          for (const id of linksOf(e)) if (all.has(id) && !out.has(id)) (out.add(id), (grew = true));
        } else if (linksOf(e).some((id) => out.has(id))) {
          out.add(e.id);
          grew = true;
        }
      }
    }
    return out;
  };

  let current = members();
  for (let round = 0; round <= MAX_ROUNDS; round++) {
    const want = [...new Set([...seeds, ...[...current].flatMap((id) => linksOf(all.get(id)!))])].filter((id) => !asked.has(id));
    if (want.length === 0 || all.size >= MAX_ENTRIES) break;
    const batch = want.slice(0, MAX_ENTRIES - all.size);
    batch.forEach((id) => asked.add(id));
    for (const e of await ann.byIds(batch)) all.set(e.id, e);
    current = members();
  }
  return new Map([...current].map((id) => [id, all.get(id)!]));
}

const orderKey = (e: AnimeEntry) => e.start ?? "9999";

/**
 * One title for a whole franchise: its TV seasons as the seasons, and every
 * season, film, OVA and special in release order as the watching order.
 * Null when the entries hold no TV season (a lone film is not an anime series here).
 */
export async function buildFranchise(entries: Map<string, AnimeEntry>, fillers: FillerList): Promise<Franchise | null> {
  const sorted = [...entries.values()].sort((a, b) => orderKey(a).localeCompare(orderKey(b)) || Number(a.id) - Number(b.id));
  const seasonEntries = sorted.filter((e) => kindOf(e) === "season");
  const root = seasonEntries[0];
  if (!root) return null;

  const recapped = new Set(
    sorted.filter((e) => e.related.some((r) => r.rel === "summary" || r.rel === "summary of")).map((e) => e.id),
  );
  const fillerBy = new Map<string, WatchPart["quickList"]>();
  // Entries that share a name share one Filler List page (Black Clover's two ANN entries): its numbers belong to the first.
  const firstOfName = new Set<string>();
  const fillerCandidates = seasonEntries.filter((e) => {
    const key = e.name.toLowerCase();
    if (firstOfName.has(key)) return false;
    firstOfName.add(key);
    return true;
  });
  await Promise.all(
    fillerCandidates
      .filter((e) => (e.episodes ?? 0) >= FILLER_MIN_EPISODES)
      .map(async (e) => {
        const kinds = await fillers.kindsOf(e.name);
        if (kinds.size) fillerBy.set(e.id, quickListOf(kinds, e.episodes ?? Infinity));
      }),
  );

  let season = 0;
  const parts: WatchPart[] = sorted.map((e) => {
    const kind = kindOf(e);
    const recap = kind !== "season" && (recapped.has(e.id) || RECAP.test(e.name));
    const part: WatchPart = {
      key: `ann-${e.id}`,
      kind,
      name: e.name,
      year: Number(e.start?.slice(0, 4)) || null,
      episodes: e.episodes,
      canon: recap ? false : null,
    };
    if (kind === "season") {
      part.season = ++season;
      const quick = fillerBy.get(e.id);
      if (quick) {
        part.quickList = quick;
        const filler = quick.filler.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
        if (filler.length) part.filler = filler;
      }
    }
    return part;
  });

  const seasons: SeasonSummary[] = parts
    .filter((p) => p.kind === "season")
    .map((p) => {
      const e = entries.get(p.key.slice(4))!;
      return {
        number: p.season!,
        episodeCount: e.episodes ?? 0,
        ...(p.name !== root.name ? { name: p.name } : {}),
        ...(e.start && e.start.length === 10 ? { airDate: e.start } : {}),
      };
    });

  const genres = [...new Set(["Animazione" as Genre, ...root.genres.map((g) => GENRES[g]).filter((g): g is Genre => Boolean(g))])];
  const title: Series = {
    id: animeId(root.id),
    type: "anime",
    title: root.name,
    year: Number(root.start?.slice(0, 4)) || 0,
    genres,
    overview: root.plot.length > 700 ? `${root.plot.slice(0, 697).trimEnd()}…` : root.plot,
    communityRating: null,
    artwork: { posterUrl: root.picture, backdropUrl: null, palette: paletteFor(root.id) },
    // Which service carries it is not something these sources say.
    providers: [],
    seasons,
    episodeRuntimeMinutes: root.runtimeMinutes ?? 24,
    watchOrder: parts,
  };
  return { title, entries };
}

function paletteFor(id: string): readonly [string, string, string] {
  const hue = (Number(id) * 47) % 360;
  return [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`];
}
