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
  const invitees = [...new Set(parsed.data.participantIds.filter((id) => id !== viewer.id && friendIds.has(id)))];
  if (!parsed.data.candidateTitleIds.includes(parsed.data.pickedTitleId)) return { ok: false, error: "Titolo non valido." };
  // A title found with the search may not be cached yet.
  const title = await ensureTitle(parsed.data.pickedTitleId);
  if (!title) return { ok: false, error: "Titolo non trovato." };
  try {
    const party = await repo.createWatchParty({
      hostId: viewer.id,
      // Selecting a friend sends an invitation; it never enrolls them without consent.
      participantIds: [viewer.id],
      pendingParticipantIds: invitees,
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

/** The invited user alone can accept or decline a watch-party invitation. */
export async function respondToWatchPartyInvitation(partyId: string, accept: boolean): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  if (!z.string().min(1).max(80).safeParse(partyId).success || typeof accept !== "boolean") {
    return { ok: false, error: "Invito non valido." };
  }
  const repo = getRepository();
  const party = (await repo.listWatchParties(viewer.id, 100)).find((item) => item.id === partyId);
  if (!party || party.hostId === viewer.id || !(party.pendingParticipantIds ?? []).includes(viewer.id)) {
    return { ok: false, error: "Questo invito non è più disponibile." };
  }
  try {
    const pendingParticipantIds = (party.pendingParticipantIds ?? []).filter((id) => id !== viewer.id);
    const participantIds = accept ? [...new Set([...party.participantIds, viewer.id])] : party.participantIds;
    await repo.updateWatchParty(party.id, { participantIds, pendingParticipantIds });
    if (accept && party.pickedTitleId && party.status === "started") {
      const title = await ensureTitle(party.pickedTitleId);
      if (title) await startNight(repo, { ...party, participantIds, pendingParticipantIds }, title);
    }
    if (accept) {
      await repo.createNotification({
        userId: party.hostId,
        kind: "watch-party",
        message: `@${viewer.username} ha accettato l'invito alla serata insieme.`,
        href: "/watch-party",
        at: new Date().toISOString(),
      });
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("watch-party invitation response failed", err);
    return { ok: false, error: "Non siamo riusciti ad aggiornare l'invito. Riprova." };
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

const updateSchema = z.object({
  participantIds: z.array(z.string().min(1).max(80)).min(1).max(12),
  when: z.enum(["now", "scheduled", "queued"]),
  scheduledFor: z.iso.datetime({ offset: true }).nullable().optional(),
});

/** The host changes a night that has not started yet: who comes, and when (or starts it now). */
export async function updateWatchParty(partyId: string, input: z.input<typeof updateSchema>): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dati della serata non validi." };
  const repo = getRepository();
  const party = (await repo.listWatchParties(viewer.id, 100)).find((p) => p.id === String(partyId).slice(0, 80));
  if (!party || party.hostId !== viewer.id || (party.status !== "scheduled" && party.status !== "queued") || !party.pickedTitleId) return { ok: false, error: "Serata non trovata." };
  const { when, scheduledFor } = parsed.data;
  if (when === "scheduled" && (!scheduledFor || Date.parse(scheduledFor) < Date.now() - 60_000)) {
    return { ok: false, error: "Scegli un giorno e un'ora che devono ancora arrivare." };
  }
  const friendIds = new Set((await repo.listFriends(viewer.id)).map((f) => f.user.id));
  const selected = new Set(parsed.data.participantIds.filter((id) => id !== viewer.id && friendIds.has(id)));
  const participantIds = [...new Set([viewer.id, ...party.participantIds.filter((id) => id !== viewer.id && selected.has(id))])];
  const pendingParticipantIds = [...selected].filter((id) => !participantIds.includes(id));
  const title = await ensureTitle(party.pickedTitleId);
  if (!title) return { ok: false, error: "Titolo non trovato." };
  try {
    const status = when === "now" ? "started" : when;
    const next = { ...party, participantIds, pendingParticipantIds, status, scheduledFor: when === "scheduled" ? new Date(scheduledFor!).toISOString() : null } as const;
    await repo.updateWatchParty(party.id, { participantIds, pendingParticipantIds, status: when === "now" ? party.status : status, scheduledFor: next.scheduledFor });
    if (when === "now") await startNight(repo, next, title);
    const newlyInvited = pendingParticipantIds.filter((id) => !(party.pendingParticipantIds ?? []).includes(id));
    if (newlyInvited.length) await announceNight(repo, { ...next, pendingParticipantIds: newlyInvited }, title, viewer.displayName);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("updateWatchParty failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare le modifiche. Riprova." };
  }
}
