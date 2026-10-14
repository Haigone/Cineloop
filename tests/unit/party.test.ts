import { beforeEach, describe, expect, it } from "vitest";
import { applyReport, driftBetween, roomPosition, watchAt } from "@/domain/party";
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

describe("room clock", () => {
  it("follows the host's player, so someone joining lands where the host is", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 2434, paused: false }, t0, "host");
    expect(roomPosition(p, after(1))).toBe(2435);
    p = applyReport(p, "guest", { externalId: "1", position: 12, paused: false }, after(5), "host");
    // A guest who just opened the episode does not move the room.
    expect(roomPosition(p, after(5))).toBe(2439);
    // The host's player buffered for a second: the room follows it.
    p = applyReport(p, "host", { externalId: "1", position: 2440, paused: false }, after(7), "host");
    expect(roomPosition(p, after(7))).toBe(2440);
  });

  it("moves for everyone when a member seeks, and the host's late report does not undo it", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 100, paused: false }, t0, "host");
    p = applyReport(p, "guest", { externalId: "1", position: 600, paused: false, action: "seek" }, after(10), "host");
    expect(p).toMatchObject({ seq: 1, by: "guest", last: "seek" });
    p = applyReport(p, "host", { externalId: "1", position: 111, paused: false }, after(11), "host");
    expect(roomPosition(p, after(11))).toBe(601);
    // Once the host has had time to follow, its player leads again.
    p = applyReport(p, "host", { externalId: "1", position: 605, paused: false }, after(15), "host");
    expect(roomPosition(p, after(15))).toBe(605);
  });

  it("lets a player that just opened the episode pause the room without moving it", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 2434, paused: false }, t0, "host");
    p = applyReport(p, "guest", { externalId: "1", position: 3, paused: true, action: "pause" }, after(2), "host");
    expect(p).toMatchObject({ paused: true, position: 2436, seq: 1 });
  });

  it("keeps a guest's pause when the host's extension hears of the room late", () => {
    let p = applyReport(null, "guest", { externalId: "1", position: 3, paused: true, action: "pause" }, t0, "host");
    // The host's first report, long after, still says "playing": it hasn't seen the pause yet.
    p = applyReport(p, "host", { externalId: "1", position: 40, paused: false }, after(12), "host");
    expect(p.paused).toBe(true);
    // Its next report follows the room it was told about.
    p = applyReport(p, "host", { externalId: "1", position: 41, paused: true }, after(14), "host");
    expect(p).toMatchObject({ paused: true, position: 41 });
  });

  it("ignores the host's autoplay right after it reopened the episode", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 40, paused: false }, t0, "host");
    p = applyReport(p, "guest", { externalId: "1", position: 41, paused: true, action: "pause" }, after(1), "host");
    p = applyReport(p, "host", { externalId: "1", position: 41, paused: true }, after(3), "host");
    p = applyReport(p, "host", { externalId: "1", position: 0.5, paused: false, following: false }, after(9), "host");
    expect(p).toMatchObject({ paused: true, position: 41 });
  });

  it("starts again from the host when the host moves to another episode", () => {
    let p = applyReport(null, "host", { externalId: "1", position: 2500, paused: false }, t0, "host");
    p = applyReport(p, "host", { externalId: "2", position: 4, paused: false, following: false }, after(5), "host");
    expect(roomPosition(p, after(5))).toBe(4);
  });

  it("stands still while paused", () => {
    const p = applyReport(null, "host", { externalId: "1", position: 50, paused: false, action: "pause" }, t0, "host");
    expect(roomPosition({ ...p, paused: true }, after(30))).toBe(50);
  });

  it("builds a Netflix link that starts at the host's point", () => {
    expect(watchAt("https://www.netflix.com/watch/81000001", 2434.7)).toBe("https://www.netflix.com/watch/81000001?t=2434");
    expect(watchAt("https://www.netflix.com/watch/81000001?trackId=1", 90)).toBe("https://www.netflix.com/watch/81000001?trackId=1&t=90");
    expect(watchAt("https://www.netflix.com/watch/81000001", null)).toBe("https://www.netflix.com/watch/81000001");
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
    expect(back.party).toMatchObject({ seq: 1, paused: true, byYou: false, byName: "Giulia Romano", lastAction: "pause" });
    // Giulia was a minute behind: her pause stops the room where Marco is.
    expect(back.party!.position).toBeGreaterThanOrEqual(300);
    expect(back.party!.position).toBeLessThan(302);
  });

  it("gives a joining friend a link at the host's point", async () => {
    await handleObservation("u_marco", watch("81000004"));
    const luca = toPublicUser((await repo.getUserById("u_luca"))!);
    const giulia = toPublicUser((await repo.getUserById("u_giulia"))!);
    expect((await joinFriend(giulia, "u_marco")).ok).toBe(true);
    await reportPlayback("u_marco", { externalId: "81000004", position: 2434, paused: true });
    const res = await joinFriend(luca, "u_marco");
    expect(res).toMatchObject({ ok: true, url: "https://www.netflix.com/watch/81000004?t=2434" });
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
