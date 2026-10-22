import "server-only";
import { getRepository } from "@/server/data";
import { getCurrentUser } from "@/server/auth/current-user";
import { summarizeByProvider, summarizeYear, wrappedYears, type ProviderWrapped, type Wrapped } from "@/lib/wrapped";

export interface WrappedView {
  /** Years with some viewing, latest first. */
  years: number[];
  /** The chosen year (the latest when none is asked for); null when there is no viewing yet. */
  wrapped: Wrapped | null;
  /** Disjoint provider breakdown of the same events used for the general total. */
  providers: ProviderWrapped[];
  /** What the page is made of, so it is clear whether an import has landed. */
  source: { plays: number; fromNetflix: number; last: string } | null;
}

/** The viewer's year in watching, from the watch events in their library. */
export async function getWrappedView(requested?: number): Promise<WrappedView> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const events = await repo.listWatchEvents(viewer.id, new Date(0));
  const years = wrappedYears(events);
  const year = requested !== undefined && years.includes(requested) ? requested : years[0];
  if (year === undefined) return { years, wrapped: null, providers: [], source: null };
  const inYear = events.filter((e) => new Date(e.watchedAt).getUTCFullYear() === year);
  const titles = await repo.getTitlesByIds([...new Set(inYear.map((e) => e.titleId))]);
  const last = inYear.reduce((a, e) => (e.watchedAt > a ? e.watchedAt : a), "");
  return {
    years,
    wrapped: summarizeYear(year, inYear, new Map(titles.map((t) => [t.id, t]))),
    providers: summarizeByProvider(year, inYear, new Map(titles.map((t) => [t.id, t]))),
    source: { plays: inYear.length, fromNetflix: inYear.filter((e) => e.providerId === "netflix").length, last },
  };
}
