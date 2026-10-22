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
      // Invitees are not participants until they explicitly accept.
      participantIds: [viewer.id],
      filter: parsed.data.filter,
      genre: parsed.data.genre,
      candidateTitleIds: parsed.data.candidateTitleIds,
      pickedTitleId: title.id,
      status: when === "now" ? "started" : when,
      scheduledFor: when === "scheduled" ? new Date(scheduledFor!).toISOString() : null,
    });
    const inviteeIds = [...new Set(participants)].filter((id) => id !== viewer.id);
    await repo.createWatchPartyInvitations(party.id, viewer.id, inviteeIds);
    for (const id of inviteeIds) {
      await repo.createNotification({
        userId: id,
        kind: "watch-party",
        message: `${viewer.displayName} ti ha invitato a una serata insieme: ${title.title}.`,
        href: "/watch-party",
        at: new Date().toISOString(),
      });
    }
    if (when === "now") await startNight(repo, party, title);
    await announceNight(repo, party, title, viewer.displayName);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("saveWatchParty failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare la serata. Riprova." };
  }
}

/** Only the invited user can accept or reject their invitation. */
export async function respondWatchPartyInvitation(invitationId: string, status: "accepted" | "rejected"): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  if (!z.string().min(1).max(160).safeParse(invitationId).success || !["accepted", "rejected"].includes(status)) {
    return { ok: false, error: "Invito non valido." };
  }
  try {
    const repo = getRepository();
    const invite = (await repo.listWatchPartyInvitations(viewer.id)).find((i) => i.id === invitationId && i.userId === viewer.id && i.status === "pending");
    if (!invite) return { ok: false, error: "L'invito non è più in attesa o non è destinato a te." };
    const parties = await repo.listWatchParties(invite.hostId, 100);
    const party = parties.find((p) => p.id === invite.partyId);
    if (!party || party.status === "done") return { ok: false, error: "Questa serata non è più disponibile." };
    const changed = await repo.respondWatchPartyInvitation(invitationId, viewer.id, status);
    if (!changed) return { ok: false, error: "L'invito è già stato gestito." };
    const host = await repo.getUserById(invite.hostId);
    if (host) await repo.createNotification({
      userId: host.id,
      kind: "watch-party",
      message: status === "accepted" ? `${viewer.displayName} ha accettato il tuo invito alla serata.` : `${viewer.displayName} ha rifiutato il tuo invito alla serata.`,
      href: "/watch-party",
      at: new Date().toISOString(),
    });
    if (status === "accepted" && party.status === "started" && party.pickedTitleId) {
      const title = (await repo.getTitlesByIds([party.pickedTitleId]))[0];
      if (title) await startNight(repo, { ...party, participantIds: [...new Set([...party.participantIds, viewer.id])] }, title);
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("respondWatchPartyInvitation failed", err);
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
  const selectedIds = [...new Set(parsed.data.participantIds.filter((id) => friendIds.has(id)))];
  // Keep only previously accepted participants; newly selected friends must accept an invitation.
  const participantIds = [...new Set([viewer.id, ...party.participantIds.filter((id) => id !== viewer.id && selectedIds.includes(id))])];
  const inviteeIds = selectedIds.filter((id) => id !== viewer.id && !party.participantIds.includes(id));
  const title = await ensureTitle(party.pickedTitleId);
  if (!title) return { ok: false, error: "Titolo non trovato." };
  try {
    const status = when === "now" ? "started" : when;
    const next = { ...party, participantIds, status, scheduledFor: when === "scheduled" ? new Date(scheduledFor!).toISOString() : null } as const;
    await repo.updateWatchParty(party.id, { participantIds, status: when === "now" ? party.status : status, scheduledFor: next.scheduledFor });
    if (when === "now") await startNight(repo, next, title);
    if (inviteeIds.length) {
      await repo.createWatchPartyInvitations(party.id, viewer.id, inviteeIds);
      for (const id of inviteeIds) {
        await repo.createNotification({
          userId: id, kind: "watch-party",
          message: `${viewer.displayName} ti ha invitato a una serata insieme: ${title.title}.`,
          href: "/watch-party", at: new Date().toISOString(),
        });
      }
    }
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("updateWatchParty failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare le modifiche. Riprova." };
  }
}
