import "server-only";
import { after, connection } from "next/server";
import type { MediaType, Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { fetchNetflixTop10, type NetflixTop10 } from "@/integrations/netflix-top10";
import { searchKey } from "@/lib/text";
import { getRepository, type Repository } from "@/server/data";
import { cacheTitles, canonical } from "./explore";

/**
 * Weekly charts for Esplora besides TMDB's trending row:
 * - Netflix's official Top 10 for Italy (public data Netflix publishes),
 *   refreshed at most once a day and stored, so pages never wait on it;
 * - what CineLoop users watched on Netflix this week, from the extension.
 */

const NETFLIX_CHART = "netflix-top10-it";
const DAY_MS = 24 * 60 * 60 * 1000;

interface StoredChart extends NetflixTop10 {
  /** Catalog ids matched to each row, in the same order (null when not found). */
  titleIds: (string | null)[];
}

export interface RankedTitle {
  title: Title;
  rank: number;
  /** "3 persone" for the community chart; season name for Netflix. */
  note: string | null;
}

export interface NetflixChart {
  week: string;
  films: RankedTitle[];
  tv: RankedTitle[];
}

/** The stored chart, and a refresh scheduled after the response when it is a day old. */
export async function getNetflixTop10(): Promise<NetflixChart | null> {
  // Freshness depends on the clock, so this always runs per request.
  await connection();
  const repo = getRepository();
  const stored = await repo.getChart(NETFLIX_CHART);
  if (!stored || Date.now() - stored.fetchedAt.getTime() > DAY_MS) {
    after(() => refreshNetflixTop10().catch((err) => console.error("Netflix Top 10 refresh failed", err)));
  }
  const chart = stored?.data as Partial<StoredChart> | undefined;
  if (!chart?.rows || !chart.titleIds || !chart.week) return null;
  const titleIds = chart.titleIds;
  const titles = new Map((await repo.getTitlesByIds(titleIds.filter((x): x is string => Boolean(x)))).map((t) => [t.id, t]));
  const ranked = chart.rows.map((row, i) => {
    const title = titleIds[i] ? titles.get(titleIds[i]!) : undefined;
    return title ? { title, rank: row.rank, note: row.season, category: row.category } : null;
  });
  const pick = (c: "film" | "tv") =>
    ranked.filter((r): r is RankedTitle & { category: typeof c } => r !== null && r.category === c).map(({ title, rank, note }) => ({ title, rank, note }));
  return { week: chart.week, films: pick("film"), tv: pick("tv") };
}

/** Downloads Netflix's file, matches the titles to the catalog and stores the result. */
export async function refreshNetflixTop10(repo: Repository = getRepository()): Promise<void> {
  // Mark the attempt first (keeping the last good chart), so concurrent or
  // failing requests do not download the file again before tomorrow.
  const previous = await repo.getChart(NETFLIX_CHART);
  await repo.saveChart(NETFLIX_CHART, previous?.data ?? { pending: true });
  const chart = await fetchNetflixTop10("IT");
  const titleIds = await Promise.all(chart.rows.map((row) => matchName(repo, row.name, row.category === "film" ? "movie" : null)));
  await repo.saveChart(NETFLIX_CHART, { ...chart, titleIds } satisfies StoredChart);
}

async function matchName(repo: Repository, name: string, type: MediaType | null): Promise<string | null> {
  const key = searchKey(name);
  const fits = (t: Title) => searchKey(t.title) === key && (type === "movie" ? t.type === "movie" : type === null ? t.type !== "movie" : true);
  const local = (await repo.searchTitles(name, 5)).find(fits);
  if (local) return local.id;
  const remote = await getCatalog().search(name, 8).catch(() => []);
  const hit = remote.find(fits) ?? remote.find((t) => (type === "movie") === (t.type === "movie"));
  if (!hit) return null;
  const [chosen] = await canonical(repo, [hit]);
  await cacheTitles(repo, [chosen!]);
  return chosen!.id;
}

/** Most watched on Netflix by CineLoop users this week (people who share their activity). */
export async function getCommunityNetflixTop(limit = 10): Promise<RankedTitle[]> {
  await connection();
  const repo = getRepository();
  const rows = await repo.topWatched({ since: new Date(Date.now() - 7 * DAY_MS), providerId: "netflix", limit });
  const titles = new Map((await repo.getTitlesByIds(rows.map((r) => r.titleId))).map((t) => [t.id, t]));
  return rows
    .filter((r) => titles.has(r.titleId))
    .map((r, i) => ({ title: titles.get(r.titleId)!, rank: i + 1, note: r.viewers === 1 ? "1 persona" : `${r.viewers} persone` }));
}
