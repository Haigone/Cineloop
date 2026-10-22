import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/server/data/memory-repository";

describe("explicit social consent", () => {
  it("does not create a friendship until the recipient accepts", async () => {
    const repo = new MemoryRepository();
    const sender = await repo.createUser({ username: "richiedente", displayName: "Richiedente", email: null, passwordHash: null });
    const recipient = await repo.createUser({ username: "destinatario", displayName: "Destinatario", email: null, passwordHash: null });

    const request = await repo.createFriendRequest(sender.id, recipient.id);
    expect(request.status).toBe("pending");
    expect((await repo.listFriends(sender.id)).some((f) => f.user.id === recipient.id)).toBe(false);

    expect(await repo.respondFriendRequest(request.id, recipient.id, "accepted")).toBe(true);
    expect((await repo.listFriends(sender.id)).some((f) => f.user.id === recipient.id)).toBe(true);
    expect((await repo.listFriendRequests(sender.id)).find((r) => r.id === request.id)?.status).toBe("accepted");
  });

  it("rejects duplicate pending requests and does not create a friendship on rejection", async () => {
    const repo = new MemoryRepository();
    const sender = await repo.createUser({ username: "mittente", displayName: "Mittente", email: null, passwordHash: null });
    const recipient = await repo.createUser({ username: "ricevente", displayName: "Ricevente", email: null, passwordHash: null });

    const first = await repo.createFriendRequest(sender.id, recipient.id);
    const duplicate = await repo.createFriendRequest(sender.id, recipient.id);
    expect(duplicate.id).toBe(first.id);
    expect(await repo.respondFriendRequest(first.id, recipient.id, "rejected")).toBe(true);
    expect(await repo.respondFriendRequest(first.id, recipient.id, "accepted")).toBe(false);
    expect((await repo.listFriends(sender.id)).some((f) => f.user.id === recipient.id)).toBe(false);
  });

  it("does not add a party invitee to participants until acceptance", async () => {
    const repo = new MemoryRepository();
    const host = await repo.createUser({ username: "organizzatore", displayName: "Organizzatore", email: null, passwordHash: null });
    const guest = await repo.createUser({ username: "invitato", displayName: "Invitato", email: null, passwordHash: null });
    const party = await repo.createWatchParty({
      hostId: host.id,
      participantIds: [host.id],
      filter: "all",
      genre: null,
      candidateTitleIds: [],
      pickedTitleId: null,
      status: "scheduled",
      scheduledFor: new Date(Date.now() + 60_000).toISOString(),
    });
    await repo.createWatchPartyInvitations(party.id, host.id, [guest.id]);
    const invitation = (await repo.listWatchPartyInvitations(guest.id))[0]!;
    expect((await repo.listWatchParties(guest.id, 10)).some((p) => p.id === party.id)).toBe(false);
    expect(await repo.respondWatchPartyInvitation(invitation.id, guest.id, "accepted")).toBe(true);
    expect((await repo.listWatchParties(guest.id, 10)).some((p) => p.id === party.id)).toBe(true);
    expect((await repo.listWatchPartyInvitations(host.id)).find((i) => i.id === invitation.id)?.status).toBe("accepted");
  });
});
