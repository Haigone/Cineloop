"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import type { LibraryEntry, RatingValue, Title } from "@/domain/types";
import { airedSeasons } from "@/domain/library";
import { ratingFromThumbs } from "@/lib/netflix-export";
import { searchKey } from "@/lib/text";
import { italianDay } from "@/lib/dates";
import { getCatalog } from "@/integrations/catalog";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { cacheTitles } from "@/server/services/explore";

/**
 * Import from the viewer's own Netflix data export (ViewingActivity.csv, Ratings.csv). The browser reads the
 * files and sends the titles in small batches; nothing here talks to Netflix. Where the library already
 * disagrees with the export, the row is a conflict and nothing changes until the viewer picks a side.
 */

const itemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["movie", "series"]),
  seasons: z.array(z.number().int().min(0).max(99)).max(60),
  thumbs: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
});
export type ImportItem = z.infer<typeof itemSchema>;

export type RowAction = "add" | "fill" | "same" | "conflict" | "notfound";

export interface ReviewRow {
  name: string;
  kind: "movie" | "series";
  seasons: number[];
  thumbs: 1 | 2 | 3 | null;
  titleId: string | null;
  title: string | null;
  year: number | null;
  action: RowAction;
  /** What the library has now, for a conflict. */
  mine: string | null;
  /** What the export says. */
  theirs: string;
}

const STATUS_LABEL: Record<string, string> = { watching: "In corso", completed: "Visto", dropped: "Abbandonato", planned: "Da vedere" };

/** What the export amounts to: a film, or a series with a thumb, was finished; otherwise it is in progress. */
function netflixSays(item: ImportItem): { status: "completed" | "watching"; rating: RatingValue | null; label: string } {
  const rating = ratingFromThumbs(item.thumbs) as RatingValue | null;
  const status = item.kind === "movie" || rating !== null ? "completed" : "watching";
  return { status, rating, label: `${STATUS_LABEL[status]}${rating ? `, voto ${rating}` : ""}` };
}

function decide(item: ImportItem, entry: LibraryEntry | undefined): { action: RowAction; mine: string | null } {
  const theirs = netflixSays(item);
  if (!entry) return { action: "add", mine: null };
  const mine = `${STATUS_LABEL[entry.status] ?? entry.status}${entry.rating ? `, voto ${entry.rating}` : ""}`;
  const ratingClash = entry.rating !== null && theirs.rating !== null && entry.rating !== theirs.rating;
  const statusClash = entry.status === "dropped" || (entry.status === "watching" && theirs.status === "completed");
  if (ratingClash || statusClash) return { action: "conflict", mine };
  if (entry.rating === null && theirs.rating !== null) return { action: "fill", mine };
  return { action: "same", mine };
}

async function matchTitle(item: ImportItem): Promise<Title | null> {
  const repo = getRepository();
  const key = searchKey(item.name);
  const local = (await repo.searchTitles(item.name, 8)).find((t) => searchKey(t.title) === key);
  if (local) return local;
  return getCatalog()
    .findByName(item.name, { series: item.kind === "series", provider: "netflix" })
    .catch(() => null);
}

/** Matches one small batch of titles against the catalogue and the viewer's library. */
export async function reviewNetflixBatch(items: ImportItem[]): Promise<ReviewRow[]> {
  const user = await getCurrentUser();
  const parsed = z.array(itemSchema).max(12).safeParse(items);
  if (!parsed.success) return [];
  const repo = getRepository();
  const library = new Map((await repo.listLibrary(user.id)).map((e) => [e.titleId, e]));
  const found: (Title | null)[] = [];
  for (let i = 0; i < parsed.data.length; i += 4) {
    found.push(...(await Promise.all(parsed.data.slice(i, i + 4).map(matchTitle))));
  }
  await cacheTitles(repo, found.filter((t): t is Title => t !== null));
  return parsed.data.map((item, i) => {
    const title = found[i] ?? null;
    const base = { ...item, titleId: title?.id ?? null, title: title?.title ?? null, year: title?.year ?? null, theirs: netflixSays(item).label };
    if (!title) return { ...base, action: "notfound" as const, mine: null };
    return { ...base, ...decide(item, library.get(title.id)) };
  });
}

const choiceSchema = z.object({ item: itemSchema, titleId: z.string().min(1).max(120), useNetflix: z.boolean() });
export type ImportChoice = z.infer<typeof choiceSchema>;

export interface ApplyResult {
  imported: number;
  skipped: number;
  failed: string[];
}

/**
 * Applies one batch. The decision is worked out again here from the library as it is now: a conflict
 * changes only when the viewer chose Netflix's side, whatever the browser sent. Old history is not announced
 * to friends: no activity is recorded.
 */
export async function applyNetflixBatch(choices: ImportChoice[]): Promise<ApplyResult> {
  const user = await getCurrentUser();
  const parsed = z.array(choiceSchema).max(30).safeParse(choices);
  const result: ApplyResult = { imported: 0, skipped: 0, failed: [] };
  if (!parsed.success) return result;
  const repo = getRepository();
  const library = new Map((await repo.listLibrary(user.id)).map((e) => [e.titleId, e]));

  for (const { item, titleId, useNetflix } of parsed.data) {
    try {
      const title = (await repo.getTitlesByIds([titleId]))[0];
      if (!title) {
        result.failed.push(item.name);
        continue;
      }
      const entry = library.get(titleId);
      const { action } = decide(item, entry);
      const theirs = netflixSays(item);
      if (action === "same" || (action === "conflict" && !useNetflix)) {
        result.skipped += 1;
        continue;
      }
      if (action === "fill") {
        // Only the missing rating: the library's own status stays.
        await repo.setRating(user.id, titleId, theirs.rating);
      } else {
        if (theirs.status === "completed") {
          const latest = title.type === "movie" ? null : airedSeasons(title, italianDay(), entry?.partOverrides).at(-1)?.number ?? null;
          const seen = item.seasons.length ? Math.max(...item.seasons) : null;
          // A rated series was finished: up to the last season seen, never past what is out.
          await repo.markFinished(user.id, titleId, title.type === "movie" ? null : seen !== null && latest !== null ? Math.min(seen, latest) : (seen ?? latest));
        } else {
          await repo.setLibraryStatus(user.id, titleId, "watching");
        }
        await repo.removeFromWishlist(user.id, titleId);
        if (theirs.rating !== null) {
          await repo.setRating(user.id, titleId, theirs.rating);
        }
      }
      result.imported += 1;
    } catch (err) {
      console.error("importing a title from the Netflix export failed", err);
      result.failed.push(item.name);
    }
  }
  refresh();
  return result;
}
