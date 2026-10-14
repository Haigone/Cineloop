import { describe, expect, it } from "vitest";
import { missingFromWishlist } from "@/domain/community";
import { MemoryRepository } from "@/server/data/memory-repository";

describe("community playlists", () => {
  it("are listed only while published, newest first, with how many saved them", async () => {
    const repo = new MemoryRepository();
    const before = (await repo.listCommunityPlaylists(10)).map((r) => r.playlist.id);
    const mine = await repo.createPlaylist("u_marco", "Natale", "private");
    expect((await repo.listCommunityPlaylists(10)).map((r) => r.playlist.id)).toEqual(before);

    expect(await repo.updatePlaylist("u_giulia", mine.id, { published: true })).toBe(false);
    await repo.updatePlaylist("u_marco", mine.id, { published: true });
    const listed = await repo.listCommunityPlaylists(10);
    expect(listed[0]!.playlist.id).toBe(mine.id);
    expect(listed[0]!.playlist.publishedAt).not.toBeNull();
    // Publishing does not change who can use it as a friend.
    expect(listed[0]!.playlist.visibility).toBe("private");

    await repo.setPlaylistSaved("u_giulia", mine.id, true);
    await repo.setPlaylistSaved("u_giulia", mine.id, true);
    expect((await repo.listCommunityPlaylists(10))[0]!.saves).toBe(1);
    expect((await repo.listSavedPlaylists("u_giulia")).map((p) => p.id)).toEqual([mine.id]);

    // Taken out of Community, it leaves the savers' lists too; published again, it comes back.
    await repo.updatePlaylist("u_marco", mine.id, { published: false });
    expect((await repo.listCommunityPlaylists(10)).map((r) => r.playlist.id)).toEqual(before);
    expect(await repo.listSavedPlaylists("u_giulia")).toEqual([]);
    await repo.updatePlaylist("u_marco", mine.id, { published: true });
    expect((await repo.listSavedPlaylists("u_giulia")).map((p) => p.id)).toEqual([mine.id]);

    await repo.setPlaylistSaved("u_giulia", mine.id, false);
    expect(await repo.listSavedPlaylists("u_giulia")).toEqual([]);
  });

  it("deleting a playlist removes it from Community and from whoever saved it", async () => {
    const repo = new MemoryRepository();
    const p = await repo.createPlaylist("u_marco", "Halloween", "friends");
    await repo.updatePlaylist("u_marco", p.id, { published: true });
    await repo.setPlaylistSaved("u_sara", p.id, true);
    await repo.deletePlaylist("u_marco", p.id);
    expect((await repo.listCommunityPlaylists(10)).some((r) => r.playlist.id === p.id)).toBe(false);
    expect((await repo.listSavedPlaylists("u_sara")).some((s) => s.id === p.id)).toBe(false);
  });

  it("adds to the wishlist only what is not there yet, each title once, in the playlist's order", () => {
    expect(missingFromWishlist(["a", "b", "c", "b", "d"], ["c"], ["d"])).toEqual(["a", "b"]);
    expect(missingFromWishlist(["a"], ["a"])).toEqual([]);
    expect(missingFromWishlist([], [])).toEqual([]);
  });
});
