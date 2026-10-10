import type { Genre, SeasonSummary, Series, WatchPart } from "@/domain/types";
import { FRANCHISE_RELATIONS, type AnnClient } from "./ann";
import type { FillerList } from "./filler-list";
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

/** The entries linked to the starting ones that belong to the same franchise, fetched in rounds. */
export async function collectEntries(seeds: readonly string[], ann: AnnClient, known: readonly AnimeEntry[] = []): Promise<Map<string, AnimeEntry>> {
  const byId = new Map(known.map((e) => [e.id, e]));
  const tried = new Set(byId.keys());
  const linked = () =>
    [...byId.values()].flatMap((e) => e.related.filter((r) => FRANCHISE_RELATIONS.has(r.rel)).map((r) => r.id));
  let frontier = [...new Set([...seeds, ...linked()])].filter((id) => !tried.has(id));
  for (let round = 0; round < MAX_ROUNDS && frontier.length > 0 && byId.size < MAX_ENTRIES; round++) {
    const batch = frontier.slice(0, MAX_ENTRIES - byId.size);
    batch.forEach((id) => tried.add(id));
    for (const e of await ann.byIds(batch)) byId.set(e.id, e);
    frontier = [...new Set(linked())].filter((id) => !tried.has(id));
  }
  return byId;
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
    sorted.filter((e) => e.related.some((r) => r.rel === "summary")).map((e) => e.id),
  );
  const fillerBy = new Map<string, number[]>();
  await Promise.all(
    seasonEntries
      .filter((e) => (e.episodes ?? 0) >= FILLER_MIN_EPISODES)
      .map(async (e) => {
        const found = await fillers.fillerOf(e.name);
        const max = e.episodes ?? Infinity;
        if (found.length) fillerBy.set(e.id, found.filter((n) => n <= max));
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
      const filler = fillerBy.get(e.id);
      if (filler?.length) part.filler = filler;
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
