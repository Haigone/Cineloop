import "server-only";
import type { Title } from "@/domain/types";
import { getCatalog } from "@/integrations/catalog";
import { ANIME_ID } from "@/integrations/anime/franchise";
import { AniListClient, alNames } from "@/integrations/anime/anilist";
import { getRepository } from "@/server/data";
import { searchKey } from "@/lib/text";
import { ensureTitle } from "./explore";

/** TMDB ids already tried without finding a franchise: asking again on every visit would be slow. */
const noMatch = new Set<string>();

/** The franchise card of the anime sources that stands for this TMDB anime, when one clearly does. */
export async function franchiseFor(old: Title): Promise<Title | null> {
  if (process.env.ANIME_SOURCES === "off") return null;
  const lookup = async (name: string) => {
    const key = searchKey(name);
    const found = await getCatalog().search(name, 6).catch(() => []);
    return (
      found.find((t) => {
        if (!ANIME_ID.test(t.id)) return false;
        const k = searchKey(t.title);
        return k === key || k.startsWith(key) || key.startsWith(k);
      }) ?? null
    );
  };
  const direct = await lookup(old.title);
  if (direct) return direct;
  // A translated or Japanese title: AniList knows the show under every name; ask ANN again with those.
  const al = (await new AniListClient().search(old.title).catch(() => [])).find((a) => {
    const y = a.startDate?.year;
    return !y || !old.year || Math.abs(y - old.year) <= 1;
  });
  for (const name of al ? alNames(al).slice(0, 3) : []) {
    const hit = await lookup(name);
    if (hit) return hit;
  }
  return null;
}

/**
 * An anime that still has a TMDB, MyAnimeList or AniList id is moved, for every profile, to its franchise card. Returns the
 * new id, or null when the title is not a TMDB anime or has no clear match.
 */
export async function migrateAnimeTitle(id: string): Promise<string | null> {
  if (!/^(tmdb-tv-\d+|anime-(al|mal)-\d+)$/.test(id) || noMatch.has(id)) return null;
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
