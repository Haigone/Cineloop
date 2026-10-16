import { describe, expect, it } from "vitest";
import { groupFor, joinNames, mirroredProgress } from "@/domain/shared-watch";
import type { WatchProgress } from "@/domain/types";
import { MemoryRepository } from "@/server/data/memory-repository";
import { alignMembers, listSharedWatchViews, shareProgress } from "@/server/services/shared-watch";

const at = (p: Partial<WatchProgress>): WatchProgress => ({
  titleId: "the-boys",
  providerId: "prime-video",
  season: 4,
  episode: 3,
  fraction: 0.4,
  url: "https://example.test/ep3",
  updatedAt: "2026-10-14T10:00:00.000Z",
  ...p,
});

describe("mirroredProgress", () => {
  it("copies the place but keeps the member's own service", () => {
    const next = mirroredProgress(at({ episode: 4, fraction: 0.1, providerId: "netflix", url: "https://netflix/ep4" }), at({}), true)!;
    expect(next).toMatchObject({ season: 4, episode: 4, fraction: 0.1, providerId: "prime-video" });
    // The mover's link is for another service, theirs is for another episode.
    expect(next.url).toBeNull();
  });

  it("takes the mover's link on the same service", () => {
    expect(mirroredProgress(at({ episode: 5, url: "https://example.test/ep5" }), at({}), true)!.url).toBe("https://example.test/ep5");
  });

  it("changes nothing when the place is already the same", () => {
    expect(mirroredProgress(at({ fraction: 0.405 }), at({}), true)).toBeNull();
    // Same place but not in progress (seen): it goes back to watching.
    expect(mirroredProgress(at({}), at({}), false)).not.toBeNull();
  });

  it("takes the host's service when the host moves", () => {
    const next = mirroredProgress(at({ providerId: "netflix", url: "https://netflix/ep3" }), at({}), true, true)!;
    expect(next).toMatchObject({ providerId: "netflix", url: "https://netflix/ep3", episode: 3 });
    // Same place, other service: still worth a write for the host's choice.
    expect(mirroredProgress(at({ providerId: "netflix" }), at({}), true, true)).not.toBeNull();
    expect(mirroredProgress(at({ providerId: "netflix" }), at({}), true, false)).toBeNull();
  });

  it("starts someone who had nothing", () => {
    expect(mirroredProgress(at({}), null, false)).toMatchObject({ season: 4, episode: 3, providerId: "prime-video" });
  });
});

describe("helpers", () => {
  it("finds the user's group for a title", () => {
    const g = { id: "g", titleId: "t", hostId: "a", memberIds: ["a", "b"], createdAt: "", updatedBy: null, updatedAt: null };
    expect(groupFor([g], "b", "t")).toBe(g);
    expect(groupFor([g], "c", "t")).toBeNull();
    expect(groupFor([g], "a", "x")).toBeNull();
  });

  it("joins names the Italian way", () => {
    expect(joinNames(["Luca"])).toBe("Luca");
    expect(joinNames(["Luca", "Sara"])).toBe("Luca e Sara");
    expect(joinNames(["Luca", "Sara", "Elena"])).toBe("Luca, Sara e Elena");
  });
});

describe("shared progress", () => {
  const entry = async (repo: MemoryRepository, userId: string, titleId: string) => (await repo.listLibrary(userId)).find((e) => e.titleId === titleId);

  it("moves every member when one member moves", async () => {
    const repo = new MemoryRepository();
    // Demo group: Marco and Luca on The Boys.
    await repo.saveProgress("u_luca", at({ episode: 5, fraction: 0.2, providerId: "prime-video", updatedAt: new Date().toISOString() }));
    await shareProgress(repo, "u_luca", "the-boys");
    const marco = await entry(repo, "u_marco", "the-boys");
    expect(marco?.status).toBe("watching");
    expect(marco?.progress).toMatchObject({ season: 4, episode: 5, fraction: 0.2 });
    const group = (await repo.listSharedWatches("u_marco"))[0]!;
    expect(group.updatedBy).toBe("u_luca");
    // A new episode is worth a word to the others.
    expect((await repo.listNotifications("u_marco"))[0]?.message).toContain("S4E5");
  });

  it("finishing it finishes it for everyone", async () => {
    const repo = new MemoryRepository();
    await repo.markFinished("u_marco", "the-boys", 4);
    await shareProgress(repo, "u_marco", "the-boys", "finished");
    expect((await entry(repo, "u_luca", "the-boys"))?.status).toBe("completed");
  });

  it("the host's service becomes everyone's, a member's stays theirs", async () => {
    const repo = new MemoryRepository();
    const group = (await repo.listSharedWatches("u_marco")).find((g) => g.titleId === "the-boys")!;
    const host = group.hostId;
    const member = group.memberIds.find((id) => id !== host)!;
    await repo.saveProgress(host, at({ episode: 6, providerId: "netflix", url: "https://netflix/ep6", updatedAt: new Date().toISOString() }));
    await shareProgress(repo, host, "the-boys");
    expect((await entry(repo, member, "the-boys"))?.progress).toMatchObject({ episode: 6, providerId: "netflix", url: "https://netflix/ep6" });
    await repo.saveProgress(member, at({ episode: 7, providerId: "prime-video", updatedAt: new Date().toISOString() }));
    await shareProgress(repo, member, "the-boys");
    expect((await entry(repo, host, "the-boys"))?.progress).toMatchObject({ episode: 7, providerId: "netflix" });
  });

  it("leaves people outside the group alone", async () => {
    const repo = new MemoryRepository();
    const before = (await entry(repo, "u_luca", "stranger-things"))?.progress ?? null;
    await repo.saveProgress("u_marco", at({ titleId: "stranger-things", season: 4, episode: 9 }));
    await shareProgress(repo, "u_marco", "stranger-things");
    expect((await entry(repo, "u_luca", "stranger-things"))?.progress ?? null).toEqual(before);
  });

  it("a new group starts everyone from the host's place", async () => {
    const repo = new MemoryRepository();
    const group = await repo.createSharedWatch({ titleId: "severance", hostId: "u_marco", memberIds: ["u_marco", "u_sara"] });
    await alignMembers(repo, group, group.memberIds);
    const host = await entry(repo, "u_marco", "severance");
    expect((await entry(repo, "u_sara", "severance"))?.progress).toMatchObject({ season: host!.progress!.season, episode: host!.progress!.episode });
    const views = await listSharedWatchViews(repo, "u_sara", new Map((await repo.listTitles()).map((t) => [t.id, t])));
    expect(views.find((v) => v.title.id === "severance")?.withLabel).toBe("Con Marco");
  });
});
