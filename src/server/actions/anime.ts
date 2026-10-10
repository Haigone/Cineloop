"use server";

import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";

const animeId = z.string().regex(/^anidb-[1-9]\d{0,8}$/);
const rootIdSchema = animeId;

export async function saveAnimeWatchPath(
  rootId: string,
  workId: string,
  included: boolean,
  watched: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const root = rootIdSchema.safeParse(rootId);
  const work = animeId.safeParse(workId);
  if (!root.success || !work.success || typeof included !== "boolean" || typeof watched !== "boolean") {
    return { ok: false, error: "Scelta del percorso non valida." };
  }
  const user = await getCurrentUser();
  try {
    await getRepository().upsertAnimeWatchPath({
      userId: user.id,
      rootId: root.data,
      animeId: work.data,
      included,
      watched: included && watched,
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  } catch (error) {
    console.error("Unable to save anime watch path", error);
    return { ok: false, error: "Impossibile salvare il percorso anime." };
  }
}
