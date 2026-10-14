"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { GENRES } from "@/domain/genres";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { groupFor } from "@/domain/shared-watch";
import { alignMembers } from "@/server/services/shared-watch";
import type { ActionResult } from "./library";

const schema = z.object({
  participantIds: z.array(z.string().min(1).max(80)).min(1).max(12),
  filter: z.enum(["common", "movie", "series", "anime", "all"]),
  genre: z.enum(GENRES).nullable(),
  candidateTitleIds: z.array(z.string().min(1).max(120)).max(500),
  pickedTitleId: z.string().min(1).max(120),
});

/** Saves the evening once the wheel has picked a title. */
export async function saveWatchParty(input: z.input<typeof schema>): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dati della serata non validi." };
  const repo = getRepository();
  const friendIds = new Set((await repo.listFriends(viewer.id)).map((f) => f.user.id));
  // Only the host and their friends can be part of a party.
  const participants = parsed.data.participantIds.filter((id) => id === viewer.id || friendIds.has(id));
  if (!parsed.data.candidateTitleIds.includes(parsed.data.pickedTitleId)) return { ok: false, error: "Titolo non valido." };
  try {
    await repo.createWatchParty({
      hostId: viewer.id,
      participantIds: [...new Set([viewer.id, ...participants])],
      filter: parsed.data.filter,
      genre: parsed.data.genre,
      candidateTitleIds: parsed.data.candidateTitleIds,
      pickedTitleId: parsed.data.pickedTitleId,
    });
    // A series or anime picked together becomes a "Serata insieme": from now on its progress is shared.
    const picked = (await repo.getTitlesByIds([parsed.data.pickedTitleId]))[0];
    if (picked && picked.type !== "movie" && !groupFor(await repo.listSharedWatches(viewer.id), viewer.id, picked.id)) {
      const others: string[] = [];
      for (const id of new Set(participants)) {
        if (id !== viewer.id && !groupFor(await repo.listSharedWatches(id), id, picked.id)) others.push(id);
      }
      if (others.length > 0) {
        const group = await repo.createSharedWatch({ titleId: picked.id, hostId: viewer.id, memberIds: [viewer.id, ...others] });
        await alignMembers(repo, group, group.memberIds);
      }
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("saveWatchParty failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare la serata. Riprova." };
  }
}
