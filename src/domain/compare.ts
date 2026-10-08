import type { Genre, LibraryEntry, Title, WishlistItem } from "./types";

export interface Side {
  library: LibraryEntry[];
  wishlist: WishlistItem[];
}

export interface SideSummary {
  movies: number;
  series: number;
  anime: number;
  wishlist: number;
  /** Average rating on the 1–10 half-star scale, or null with no ratings. */
  averageRating: number | null;
}

export interface Comparison {
  a: SideSummary;
  b: SideSummary;
  /** Seen by both, with both ratings when present. */
  common: { title: Title; ratingA: number | null; ratingB: number | null }[];
  bothWant: Title[];
  onlyA: Title[];
  onlyB: Title[];
  commonGenres: Genre[];
  /** 0–100: how aligned the two tastes are. */
  compatibility: number;
}

const watched = (e: LibraryEntry) => e.status === "completed" || e.status === "watching";

export function summarize(side: Side, titles: Map<string, Title>): SideSummary {
  const seen = side.library.filter(watched);
  const count = (t: Title["type"]) => seen.filter((e) => titles.get(e.titleId)?.type === t).length;
  const rated = side.library.filter((e) => e.rating != null);
  return {
    movies: count("movie"),
    series: count("series"),
    anime: count("anime"),
    wishlist: side.wishlist.length,
    averageRating: rated.length ? rated.reduce((s, e) => s + e.rating!, 0) / rated.length : null,
  };
}

/** Genre weights from what someone watched; liked titles count more. */
export function genreProfile(library: LibraryEntry[], titles: Map<string, Title>): Map<Genre, number> {
  const out = new Map<Genre, number>();
  for (const e of library.filter(watched)) {
    const t = titles.get(e.titleId);
    if (!t) continue;
    const weight = e.rating ? e.rating / 5 : 1;
    t.genres.forEach((g, i) => out.set(g, (out.get(g) ?? 0) + weight * (i === 0 ? 1 : 0.6)));
  }
  return out;
}

export function topGenres(profile: Map<Genre, number>, n: number): Genre[] {
  return [...profile.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, n)
    .map(([g]) => g);
}

/** Cosine similarity of genre profiles, nudged by agreement on shared ratings. */
function similarity(pa: Map<Genre, number>, pb: Map<Genre, number>, common: Comparison["common"]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const g of new Set([...pa.keys(), ...pb.keys()])) {
    const x = pa.get(g) ?? 0;
    const y = pb.get(g) ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const cosine = na && nb ? dot / Math.sqrt(na * nb) : 0;
  const pairs = common.filter((c) => c.ratingA != null && c.ratingB != null);
  const agreement = pairs.length
    ? 1 - pairs.reduce((s, c) => s + Math.abs(c.ratingA! - c.ratingB!), 0) / (pairs.length * 9)
    : cosine;
  return Math.round((cosine * 0.6 + agreement * 0.4) * 100);
}

export function compare(a: Side, b: Side, titles: Map<string, Title>): Comparison {
  const seenA = new Map(a.library.filter(watched).map((e) => [e.titleId, e]));
  const seenB = new Map(b.library.filter(watched).map((e) => [e.titleId, e]));
  const wantB = new Set(b.wishlist.map((w) => w.titleId));
  const get = (id: string) => titles.get(id);
  const byTitle = (x: Title, y: Title) => x.title.localeCompare(y.title, "it");

  const common = [...seenA.keys()]
    .filter((id) => seenB.has(id) && get(id))
    .map((id) => ({ title: get(id)!, ratingA: seenA.get(id)!.rating, ratingB: seenB.get(id)!.rating }))
    .sort((x, y) => byTitle(x.title, y.title));

  const pa = genreProfile(a.library, titles);
  const pb = genreProfile(b.library, titles);
  const ta = topGenres(pa, 5);
  const tb = new Set(topGenres(pb, 5));

  return {
    a: summarize(a, titles),
    b: summarize(b, titles),
    common,
    bothWant: a.wishlist.filter((w) => wantB.has(w.titleId) && get(w.titleId)).map((w) => get(w.titleId)!).sort(byTitle),
    onlyA: [...seenA.keys()].filter((id) => !seenB.has(id) && get(id)).map((id) => get(id)!).sort(byTitle),
    onlyB: [...seenB.keys()].filter((id) => !seenA.has(id) && get(id)).map((id) => get(id)!).sort(byTitle),
    commonGenres: ta.filter((g) => tb.has(g)),
    compatibility: similarity(pa, pb, common),
  };
}
