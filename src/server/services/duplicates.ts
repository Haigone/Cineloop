import "server-only";
import { replacementOf } from "@/domain/duplicates";
import { getRepository } from "@/server/data";
import { ensureTitle } from "./explore";

/**
 * A duplicate's page opens the title kept in its place. Whatever was still saved on the duplicate
 * (lists, progress, ratings, groups) moves there first, for every profile. Returns the kept id,
 * or null when this id is not a duplicate.
 */
export async function retireDuplicate(id: string): Promise<string | null> {
  const keep = replacementOf(id);
  if (!keep) return null;
  try {
    const repo = getRepository();
    const [old] = await repo.getTitlesByIds([id]);
    const kept = old && (await ensureTitle(keep));
    if (kept) await repo.replaceTitle(id, kept);
  } catch (err) {
    console.error("moving a duplicate title failed", err);
  }
  return keep;
}
