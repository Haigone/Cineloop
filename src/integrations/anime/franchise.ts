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
const ALTERNATIVE_RELATIONS = new Set(["remake", "remake of", "alternative version", "alternative version of"]);
const ALTERNATIVE_TITLE_SUFFIX = /\s+(?:director s cut|directors cut|director cut|extended edition|special edition|remastered edition|remastered|recut|kai)$/;

/** A known alternate-cut suffix removed from a normalized title, or null for ordinary titles. */
function alternativeTitleBase(name: string): string | null {
  const normalized = name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const base = normalized.replace(ALTERNATIVE_TITLE_SUFFIX, "").trim();
  return base && base !== normalized ? base : null;
}

/**
 * Map an alternate cut to the earlier season it reworks. ANN relations are preferred,
 * but not every entry has them (notably some Director's Cuts), so known title suffixes
 * provide a conservative fallback when they exactly match an earlier season's title.
 */
function alternativeSeasonBases(entries: readonly AnimeEntry[]): Map<string, string> {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const bases = new Map<string, string>();
  for (const entry of entries) {
    for (const relation of entry.related) {
      if (!ALTERNATIVE_RELATIONS.has(relation.rel)) continue;
      const other = byId.get(relation.id);
      if (!other || other.id === entry.id || kindOf(other) !== "season" || kindOf(entry) !== "season") continue;
      const entryDate = orderKey(entry);
      const otherDate = orderKey(other);
      const entryIsLater = entryDate !== otherDate
        ? entryDate.localeCompare(otherDate) > 0
        : /(?:remake|alternative version) of/.test(relation.rel);
      const alternate = entryIsLater ? entry : other;
      const original = entryIsLater ? other : entry;
      if (!bases.has(alternate.id)) bases.set(alternate.id, original.id);
    }
  }

  // Some ANN records omit the relation entirely. Only infer an alternate when a recognized
  // suffix is removed and the remaining title exactly matches an earlier TV/ONA season.
  for (const entry of entries) {
    if (bases.has(entry.id) || kindOf(entry) !== "season") continue;
    const baseName = alternativeTitleBase(entry.name);
    if (!baseName) continue;
    const original = entries
      .filter((other) => other.id !== entry.id && kindOf(other) === "season"
        && other.start && entry.start && orderKey(other) < orderKey(entry))
      .find((other) => {
        const normalized = other.name.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
        return normalized === baseName;
      });
    if (original) bases.set(entry.id, original.id);
  }
  return bases;
}

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
 * How many episodes the earlier TV entries of the same name already cover. ANN splits a long run
 * (One Piece, Black Clover) into entries of one name and may number the later one from the start of
 * the run, so its "1180 episodes" are really 25 after the 1155 of the first. A number above this
 * offset is run-wide; one at or below it already counts from the entry's own first episode.
 */
export function runOffset(entries: ReadonlyMap<string, AnimeEntry>, e: AnimeEntry): number {
  const name = e.name.toLowerCase();
  return [...entries.values()]
    .filter((o) => o.id !== e.id && kindOf(o) === "season" && o.name.toLowerCase() === name && (orderKey(o).localeCompare(orderKey(e)) || Number(o.id) - Number(e.id)) < 0)
    .reduce((sum, o) => sum + (o.episodes ?? 0), 0);
}

/** An episode number of the run, counted from the entry's own first episode. */
export const withinEntry = (n: number, offset: number) => (offset > 0 && n > offset ? n - offset : n);

/**
 * One title for a whole franchise: its TV seasons as the seasons, and every
 * season, film, OVA and special in release order as the watching order.
 * Null when the entries hold no TV season (a lone film is not an anime series here).
 */
export async function buildFranchise(entries: Map<string, AnimeEntry>, fillers: FillerList): Promise<Franchise | null> {
  const sorted = [...entries.values()].sort((a, b) => orderKey(a).localeCompare(orderKey(b)) || Number(a.id) - Number(b.id));
  const seasonEntries = sorted.filter((e) => kindOf(e) === "season");
  const alternativeBases = alternativeSeasonBases(sorted);
  const canonicalSeasons = seasonEntries.filter((e) => !alternativeBases.has(e.id));
  const root = canonicalSeasons[0] ?? seasonEntries[0];
  if (!root) return null;

  const recapped = new Set(
    sorted.filter((e) => e.related.some((r) => r.rel === "summary" || r.rel === "summary of")).map((e) => e.id),
  );
  const fillerBy = new Map<string, WatchPart["quickList"]>();
  // Entries that share a name share one Filler List page (Black Clover's two ANN entries): its numbers belong to the first.
  const firstOfName = new Set<string>();
  const fillerCandidates = canonicalSeasons.filter((e) => {
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
  const seasonNumberById = new Map<string, number>();
  for (const e of seasonEntries) {
    const baseId = alternativeBases.get(e.id);
    const number = baseId ? seasonNumberById.get(baseId) : undefined;
    if (number !== undefined) seasonNumberById.set(e.id, number);
    else seasonNumberById.set(e.id, ++season);
  }
  const parts: WatchPart[] = sorted.map((e) => {
    const kind = kindOf(e);
    const recap = kind !== "season" && (recapped.has(e.id) || RECAP.test(e.name));
    const part: WatchPart = {
      key: `ann-${e.id}`,
      kind,
      name: e.name,
      year: Number(e.start?.slice(0, 4)) || null,
      episodes: e.episodes === null ? null : withinEntry(e.episodes, runOffset(entries, e)),
      canon: recap ? false : null,
    };
    if (kind === "season") {
      part.season = seasonNumberById.get(e.id)!;
      const quick = fillerBy.get(e.id);
      if (quick) {
        part.quickList = quick;
        const filler = quick.filler.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, i) => a + i));
        if (filler.length) part.filler = filler;
      }
    }
    return part;
  });

  const seasons: SeasonSummary[] = canonicalSeasons.map((base) => {
    const number = seasonNumberById.get(base.id)!;
    const representative = seasonEntries
      .filter((e) => (alternativeBases.get(e.id) ?? e.id) === base.id)
      .at(-1) ?? base;
    return {
      number,
      episodeCount: withinEntry(representative.episodes ?? 0, runOffset(entries, representative)),
      ...(base.name !== root.name ? { name: base.name } : {}),
      ...(base.start && base.start.length === 10 ? { airDate: base.start } : {}),
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
    // Re:Zero Director's Cut episodes are about an hour, not the original 24-minute format.
    episodeRuntimeMinutes: /re\\s*:?\\s*zero/i.test(root.name)
      && seasonEntries.some((e) => alternativeBases.get(e.id) === root.id && /director.?s cut|shin[-_ ]+henshuu/i.test(e.name))
      ? 60
      : root.runtimeMinutes ?? 24,
    watchOrder: parts,
  };
  return { title, entries };
}

function paletteFor(id: string): readonly [string, string, string] {
  const hue = (Number(id) * 47) % 360;
  return [`hsl(${hue} 70% 45%)`, `hsl(${hue} 45% 12%)`, `hsl(${(hue + 40) % 360} 80% 70%)`];
}
