import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/server/data/memory-repository";

describe("playlists", () => {
  it("are kept by their owner, and shared with friends only when the owner says so", async () => {
    const repo = new MemoryRepository();
    const natale = await repo.createPlaylist("u_marco", "Natale", "private");
    const horror = await repo.createPlaylist("u_marco", "Halloween", "friends");
    expect((await repo.listSharedPlaylists(["u_marco"])).map((p) => p.name)).toEqual(["Halloween"]);
    expect(await repo.listSharedPlaylists([])).toEqual([]);

    await repo.updatePlaylist("u_marco", natale.id, { visibility: "friends" });
    expect((await repo.listSharedPlaylists(["u_marco"])).map((p) => p.name).sort()).toEqual(["Halloween", "Natale"]);
    expect(horror.visibility).toBe("friends");
  });

  it("can be changed only by their owner", async () => {
    const repo = new MemoryRepository();
    const mine = await repo.createPlaylist("u_marco", "Natale", "private");
    expect(await repo.updatePlaylist("u_giulia", mine.id, { name: "Mia" })).toBe(false);
    expect(await repo.setPlaylistItem("u_giulia", mine.id, "frieren", true)).toBe(false);
    expect(await repo.deletePlaylist("u_giulia", mine.id)).toBe(false);
    expect((await repo.listPlaylists("u_marco"))[0]!.name).toBe("Natale");
  });

  it("hold a title once, in the order added, and let it go", async () => {
    const repo = new MemoryRepository();
    const p = await repo.createPlaylist("u_marco", "Natale", "private");
    await repo.setPlaylistItem("u_marco", p.id, "frieren", true);
    await repo.setPlaylistItem("u_marco", p.id, "arcane", true);
    await repo.setPlaylistItem("u_marco", p.id, "frieren", true);
    expect((await repo.listPlaylists("u_marco"))[0]!.titleIds).toEqual(["frieren", "arcane"]);
    await repo.setPlaylistItem("u_marco", p.id, "frieren", false);
    expect((await repo.listPlaylists("u_marco"))[0]!.titleIds).toEqual(["arcane"]);
    expect(await repo.deletePlaylist("u_marco", p.id)).toBe(true);
    expect(await repo.listPlaylists("u_marco")).toEqual([]);
  });
});
