import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/server/data/memory-repository";

async function pair() {
  const repo = new MemoryRepository();
  const requester = await repo.createUser({ username: "requester", displayName: "Requester", email: null, passwordHash: null });
  const recipient = await repo.createUser({ username: "recipient", displayName: "Recipient", email: null, passwordHash: null });
  return { repo, requester, recipient };
}

describe("social consent", () => {
  it("does not establish friendship until the recipient accepts", async () => {
    const { repo, requester, recipient } = await pair();
    expect(await repo.createFriendRequest(requester.id, recipient.id)).toBe(true);
    expect(await repo.listFriends(requester.id)).toEqual([]);
    expect(await repo.listFriendRequests(recipient.id)).toMatchObject([
      { user: { id: requester.id, username: "requester" } },
    ]);

    expect(await repo.respondFriendRequest(recipient.id, requester.id, true)).toBe(true);
    expect((await repo.listFriends(requester.id)).map((friend) => friend.user.id)).toContain(recipient.id);
    expect(await repo.listFriendRequests(recipient.id)).toEqual([]);
  });

  it("removes a declined request without adding a friendship", async () => {
    const { repo, requester, recipient } = await pair();
    await repo.createFriendRequest(requester.id, recipient.id);
    expect(await repo.respondFriendRequest(recipient.id, requester.id, false)).toBe(true);
    expect(await repo.listFriends(requester.id)).toEqual([]);
    expect(await repo.listFriendRequests(recipient.id)).toEqual([]);
  });

  it("keeps watch-party invitees pending until they accept", async () => {
    const { repo, requester, recipient } = await pair();
    const party = await repo.createWatchParty({
      hostId: requester.id,
      participantIds: [requester.id],
      pendingParticipantIds: [recipient.id],
      filter: "all",
      genre: null,
      candidateTitleIds: ["dark"],
      pickedTitleId: "dark",
      status: "started",
      scheduledFor: null,
    });
    const inviteeView = (await repo.listWatchParties(recipient.id, 10))[0];
    expect(inviteeView?.id).toBe(party.id);
    expect(inviteeView?.participantIds).not.toContain(recipient.id);
    expect(inviteeView?.pendingParticipantIds).toContain(recipient.id);

    await repo.updateWatchParty(party.id, {
      participantIds: [requester.id, recipient.id],
      pendingParticipantIds: [],
    });
    const accepted = (await repo.listWatchParties(recipient.id, 10))[0];
    expect(accepted?.participantIds).toContain(recipient.id);
    expect(accepted?.pendingParticipantIds).toEqual([]);
  });
});
