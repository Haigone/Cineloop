import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { ANIME_ID } from "@/integrations/anime/franchise";
import { getRepository } from "@/server/data";
import { searchKey } from "@/lib/text";
import { ensureTitle } from "./explore";

/** TMDB ids already tried without finding a franchise: asking again on every visit would be slow. */
const noMatch = new Set<string>();

/** The franchise card of the anime sources that stands for this TMDB anime, when one clearly does. */
export async function franchiseFor(old: Title): Promise<Title | null> {
  if (process.env.ANIME_SOURCES === "off") return null;
  const key = searchKey(old.title);
  const found = await getCatalog().search(old.title, 6).catch(() => []);
  return (
    found.find((t) => {
      if (!ANIME_ID.test(t.id)) return false;
      const k = searchKey(t.title);
      return k === key || k.startsWith(key) || key.startsWith(k);
    }) ?? null
  );
}

/**
 * An anime that still has its TMDB id is moved, for every profile, to its franchise card. Returns the
 * new id, or null when the title is not a TMDB anime or has no clear match.
 */
export async function migrateAnimeTitle(id: string): Promise<string | null> {
  if (!/^tmdb-tv-\d+$/.test(id) || noMatch.has(id)) return null;
  try {
    const old = await ensureTitle(id);
    if (!old || old.type !== "anime") return null;
    const hit = await franchiseFor(old);
    if (!hit) {
      noMatch.add(id);
      return null;
    }
    await getRepository().replaceTitle(old.id, hit);
    return hit.id;
  } catch (err) {
    console.error("moving an anime to its franchise failed", err);
    return null;
  }
}
