"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { GENRES } from "@/domain/genres";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle } from "@/server/services/explore";
import { announceNight, startNight } from "@/server/services/nights";
import type { ActionResult } from "./library";

const schema = z.object({
  participantIds: z.array(z.string().min(1).max(80)).min(1).max(12),
  filter: z.enum(["common", "movie", "series", "anime", "all"]),
  genre: z.enum(GENRES).nullable(),
  candidateTitleIds: z.array(z.string().min(1).max(120)).max(500),
  pickedTitleId: z.string().min(1).max(120),
  /** Start now (it goes on everyone's Home), at a set time, or after the nights already started. */
  when: z.enum(["now", "scheduled", "queued"]).default("now"),
  scheduledFor: z.iso.datetime({ offset: true }).nullable().optional(),
});

/**
 * Saves the evening once its title is chosen (by the wheel or by hand). Starting now makes it a
 * "Serata insieme" right away; a scheduled or queued one starts by itself later.
 */
export async function saveWatchParty(input: z.input<typeof schema>): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dati della serata non validi." };
  const { when, scheduledFor } = parsed.data;
  if (when === "scheduled" && (!scheduledFor || Date.parse(scheduledFor) < Date.now() - 60_000)) {
    return { ok: false, error: "Scegli un giorno e un'ora che devono ancora arrivare." };
  }
  const repo = getRepository();
  const friendIds = new Set((await repo.listFriends(viewer.id)).map((f) => f.user.id));
  // Only the host and their friends can be part of a party.
  const participants = parsed.data.participantIds.filter((id) => id === viewer.id || friendIds.has(id));
  if (!parsed.data.candidateTitleIds.includes(parsed.data.pickedTitleId)) return { ok: false, error: "Titolo non valido." };
  // A title found with the search may not be cached yet.
  const title = await ensureTitle(parsed.data.pickedTitleId);
  if (!title) return { ok: false, error: "Titolo non trovato." };
  try {
    const party = await repo.createWatchParty({
      hostId: viewer.id,
      participantIds: [...new Set([viewer.id, ...participants])],
      filter: parsed.data.filter,
      genre: parsed.data.genre,
      candidateTitleIds: parsed.data.candidateTitleIds,
      pickedTitleId: title.id,
      status: when === "now" ? "started" : when,
      scheduledFor: when === "scheduled" ? new Date(scheduledFor!).toISOString() : null,
    });
    if (when === "now") await startNight(repo, party, title);
    await announceNight(repo, party, title, viewer.displayName);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("saveWatchParty failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare la serata. Riprova." };
  }
}

/** The host drops a night that has not started yet. */
export async function cancelWatchParty(partyId: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  const party = (await repo.listWatchParties(viewer.id, 100)).find((p) => p.id === String(partyId).slice(0, 80));
  if (!party || party.hostId !== viewer.id || (party.status !== "scheduled" && party.status !== "queued")) return { ok: false, error: "Serata non trovata." };
  await repo.setWatchPartyStatus(party.id, "done");
  refresh();
  return { ok: true };
}
