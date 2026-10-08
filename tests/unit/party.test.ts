import { beforeEach, describe, expect, it } from "vitest";
import { applyReport, driftBetween } from "@/domain/party";
import { getRepository } from "@/server/data";
import { endPresence, getExtensionStatus, handleObservation, joinFriend, listLiveFriends, reportPlayback, setLiveVisible } from "@/server/services/sync";
import { toPublicUser } from "@/server/services/shared";

const t0 = new Date("2026-10-08T21:00:00Z");
const after = (s: number) => new Date(t0.getTime() + s * 1000);

describe("party state", () => {
  it("counts each play or pause once and remembers who pressed it", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 10, paused: false }, t0);
    expect(p).toMatchObject({ seq: 0, paused: false });
    p = applyReport(p, "guest", { externalId: "1", position: 12, paused: true, action: "pause" }, after(2));
    expect(p).toMatchObject({ seq: 1, paused: true, by: "guest", position: 12 });
    p = applyReport(p, "host", { externalId: "1", position: 14, paused: false }, after(4));
    expect(p.seq).toBe(1);
  });

  it("measures who is ahead from recent reports on the same episode", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 100, paused: false }, t0);
    p = applyReport(p, "guest", { externalId: "1", position: 60, paused: false }, after(2));
    // At +2 s the host is at about 102.
    expect(driftBetween(p, "host", "guest", after(2))).toBe(42);
    expect(driftBetween(p, "guest", "host", after(2))).toBe(-42);
    expect(driftBetween(p, "host", "guest", after(60))).toBeNull();
    p = applyReport(p, "guest", { externalId: "2", position: 5, paused: false }, after(3));
    expect(driftBetween(p, "host", "guest", after(3))).toBeNull();
  });
});

describe("watch together", () => {
  const repo = getRepository();
  const watch = (id: string) => ({ providerId: "netflix" as const, url: `https://www.netflix.com/watch/${id}`, documentTitle: "Netflix", observedAt: new Date().toISOString() });

  beforeEach(async () => {
    await endPresence("u_marco");
    await endPresence("u_giulia");
    await setLiveVisible("u_marco", true);
  });

  it("passes a guest's pause to the host and shows who is behind", async () => {
    await handleObservation("u_marco", watch("81000001"));
    const giulia = toPublicUser((await repo.getUserById("u_giulia"))!);
    expect((await joinFriend(giulia, "u_marco")).ok).toBe(true);
    await handleObservation("u_giulia", watch("81000001"));

    const host = await reportPlayback("u_marco", { externalId: "81000001", position: 300, paused: false });
    expect(host.party).toMatchObject({ isHost: true, members: ["Giulia Romano"], seq: 0 });

    const guest = await reportPlayback("u_giulia", { externalId: "81000001", position: 240, paused: true, action: "pause" });
    expect(guest.party).toMatchObject({ isHost: false, hostName: "Marco Bianchi", byYou: true, paused: true, sameEpisode: true });
    expect(guest.party!.offsets[0]).toMatchObject({ name: "Marco Bianchi" });
    expect(guest.party!.offsets[0]!.seconds).toBeGreaterThan(50);

    const back = await reportPlayback("u_marco", { externalId: "81000001", position: 301, paused: false });
    expect(back.party).toMatchObject({ seq: 1, paused: true, byYou: false, byName: "Giulia Romano" });
  });

  it("is not a room for someone watching alone", async () => {
    await handleObservation("u_marco", watch("81000002"));
    expect((await reportPlayback("u_marco", { externalId: "81000002", position: 1, paused: false })).party).toBeNull();
  });

  it("hides a viewer who is not visible, and nobody can join them", async () => {
    await handleObservation("u_marco", watch("81000003"));
    await setLiveVisible("u_marco", false);
    expect((await getExtensionStatus("u_marco")).visible).toBe(false);
    expect((await listLiveFriends(repo, "u_giulia", ["u_marco"])).length).toBe(0);
    const giulia = toPublicUser((await repo.getUserById("u_giulia"))!);
    expect((await joinFriend(giulia, "u_marco")).ok).toBe(false);
    await setLiveVisible("u_marco", true);
    expect((await listLiveFriends(repo, "u_giulia", ["u_marco"])).length).toBe(1);
  });
});

describe("library follows the player", () => {
  const repo = getRepository();
  const watch = (id: string, hints: Record<string, unknown> = {}) => ({
    providerId: "netflix" as const,
    url: `https://www.netflix.com/watch/${id}`,
    documentTitle: "Netflix",
    hints,
    observedAt: new Date().toISOString(),
  });

  it("puts a series seen before back in progress, with episode and position", async () => {
    await endPresence("u_marco");
    // Marco has Breaking Bad as seen (completed).
    expect((await repo.listLibrary("u_marco")).find((e) => e.titleId === "breaking-bad")?.status).toBe("completed");
    await handleObservation("u_marco", watch("82000001", { title: "Breaking Bad", season: 5, episode: 14, progress: 0.25 }));
    let entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "breaking-bad")!;
    expect(entry.status).toBe("watching");
    expect(entry.progress).toMatchObject({ season: 5, episode: 14, fraction: 0.25 });

    await handleObservation("u_marco", watch("82000001", { title: "Breaking Bad", season: 5, episode: 14, progress: 0.6 }));
    entry = (await repo.listLibrary("u_marco")).find((e) => e.titleId === "breaking-bad")!;
    expect(entry.progress?.fraction).toBe(0.6);
    await endPresence("u_marco");
  });

  it("works out the season when the player shows only the episode", async () => {
    const { inferSeason } = await import("@/domain/presence");
    const { SEED_TITLE_MAP } = await import("@/server/data/seed/catalog");
    const dark = SEED_TITLE_MAP.get("dark")!; // 10, 8, 8
    expect(inferSeason(dark, { season: 2, episode: 3 }, 4)).toBe(2);
    expect(inferSeason(dark, { season: 1, episode: 10 }, 1)).toBe(2);
    expect(inferSeason(dark, null, 1)).toBeNull();
    expect(inferSeason(SEED_TITLE_MAP.get("adolescence")!, null, 2)).toBe(1);
  });
});
