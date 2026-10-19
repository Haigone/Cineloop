import type { CollectionChoice, CollectionPart, FilmCollection, WatchStatus } from "./types";

/**
 * Sagas and trilogies: the films of a collection in the viewer's watching
 * order, which of them they leave out, and how far they are.
 */

export const DEFAULT_CHOICE: Omit<CollectionChoice, "collectionId"> = { order: [], excluded: [] };

/** Reserved entries in CollectionChoice.excluded; they never match a real film ID. */
export const COLLECTION_FOLLOW_MARKER = "__cineloop_follow_collection__";
export const COLLECTION_CONTEXT_PREFIX = "__cineloop_context__:";

/** Release order: dated films by date, then the ones announced without a date. */
export function releaseOrder(parts: readonly CollectionPart[]): CollectionPart[] {
  return [...parts].sort((a, b) => (a.releaseDate ?? "9999").localeCompare(b.releaseDate ?? "9999") || a.title.title.localeCompare(b.title.title));
}

/**
 * The viewer's watching order: release order until they move something. Films
 * the saga gained after they chose an order go at the end, in release order.
 */
export function orderedParts(collection: Pick<FilmCollection, "parts">, choice: Pick<CollectionChoice, "order"> | null | undefined): CollectionPart[] {
  const byRelease = releaseOrder(collection.parts);
  const order = choice?.order ?? [];
  if (order.length === 0) return byRelease;
  const byId = new Map(byRelease.map((p) => [p.title.id, p]));
  const placed = order.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const placedIds = new Set(placed.map((p) => p.title.id));
  return [...placed, ...byRelease.filter((p) => !placedIds.has(p.title.id))];
}

export function isExcluded(titleId: string, choice: Pick<CollectionChoice, "excluded"> | null | undefined): boolean {
  return Boolean(choice?.excluded.includes(titleId));
}

/** Out on or before `today` (a film coming out today counts: it can be watched tonight). */
export function isReleased(part: CollectionPart, today: string): boolean {
  return part.releaseDate !== null && part.releaseDate <= today;
}

/** `ids` with `id` moved one place up (-1) or down (+1); unchanged at either end. */
export function moveInOrder(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ids.length) return [...ids];
  const next = [...ids];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
}

export interface SagaRow {
  part: CollectionPart;
  included: boolean;
  status: WatchStatus | null;
  released: boolean;
}

export interface SagaStatus {
  collection: FilmCollection;
  /** Every film, in the viewer's order. */
  rows: SagaRow[];
  /** Included films the viewer has seen, and how many are included in all. */
  seen: number;
  total: number;
  /** At least one included film seen or being watched. */
  started: boolean;
  /** The first included film that is out and not seen yet (one being watched counts as next). */
  next: CollectionPart | null;
  /** Included films out and not seen yet. */
  remaining: number;
  /** Included films not out yet, soonest first; undated ones last. */
  upcoming: CollectionPart[];
}

export function sagaStatus(
  collection: FilmCollection,
  choice: Pick<CollectionChoice, "order" | "excluded"> | null | undefined,
  statuses: ReadonlyMap<string, WatchStatus>,
  today: string,
): SagaStatus {
  const rows = orderedParts(collection, choice).map((part) => ({
    part,
    included: !isExcluded(part.title.id, choice),
    status: statuses.get(part.title.id) ?? null,
    released: isReleased(part, today),
  }));
  const included = rows.filter((r) => r.included);
  const toWatch = included.filter((r) => r.released && r.status !== "completed");
  return {
    collection,
    rows,
    seen: included.filter((r) => r.status === "completed").length,
    total: included.length,
    started: included.some((r) => r.status === "completed" || r.status === "watching"),
    next: toWatch[0]?.part ?? null,
    remaining: toWatch.length,
    upcoming: releaseOrder(included.filter((r) => !r.released).map((r) => r.part)),
  };
}

/** A saga worth a reminder: started, with films still to watch or still to come out. */
export function isOpenSaga(s: SagaStatus): boolean {
  return s.started && (s.remaining > 0 || s.upcoming.length > 0);
}

/** "18 dicembre 2026", always with the year, so a reminder reads the same whenever it is sent. */
export function longDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/**
 * The reminders a started saga deserves. Each one's text names the film (and
 * the date), so it is sent once and a new one goes out when something changes:
 * the next film after watching one, a date announced or moved, release day.
 */
export function sagaNotices(s: SagaStatus, today: string): { message: string; titleId: string }[] {
  if (!s.started) return [];
  const name = s.collection.name;
  const out: { message: string; titleId: string }[] = [];
  if (s.next) {
    const left = s.remaining === 1 ? "ti manca 1 film" : `ti mancano ${s.remaining} film`;
    out.push({ titleId: s.next.title.id, message: `Hai iniziato la saga ${name}: ${left}. Il prossimo è ${s.next.title.title}.` });
  }
  for (const row of s.rows) {
    if (row.included && row.part.releaseDate === today && row.status !== "completed") {
      out.push({ titleId: row.part.title.id, message: `Esce oggi ${row.part.title.title}, il nuovo film della saga ${name}.` });
    }
  }
  for (const part of s.upcoming) {
    out.push({
      titleId: part.title.id,
      message: part.releaseDate
        ? `${part.title.title}, nuovo film della saga ${name}, esce il ${longDay(part.releaseDate)}.`
        : `${part.title.title}, nuovo film della saga ${name}, è annunciato ma non ha ancora una data.`,
    });
  }
  return out;
}
