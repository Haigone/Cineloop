import { describe, expect, it } from "vitest";
import { nightCandidates, sourceKey, toPartyMember, type PartySource } from "@/domain/watch-party";
import type { MediaType, Series, Title, WatchParty } from "@/domain/types";
import { MemoryRepository } from "@/server/data/memory-repository";
import { activateNights, startNight } from "@/server/services/nights";
import { entry, title, user, wish } from "../fixtures";

const titles = [title("a"), title("b", "series", ["Crime"]), title("c", "anime", ["Animazione"]), title("d"), title("seen"), title("p", "series")];
const me = toPartyMember(user("me"), [entry("me", "seen")], [wish("me", "a"), wish("me", "b"), wish("me", "seen")]);
const giu = toPartyMember(user("giu"), [], [wish("giu", "a"), wish("giu", "c")]);
const all = new Set<MediaType>(["movie", "series", "anime"]);
const playlist: PartySource = { key: sourceKey("community", "pl1"), kind: "community", ownerId: "u_x", label: "Natale", titleIds: ["p", "seen"] };
const ids = (input: Partial<Parameters<typeof nightCandidates>[0]>) =>
  nightCandidates({ members: [me, giu], titles, categories: all, genre: null, wishlist: "all", match: "any", sources: [playlist], pickedSources: new Set(), ...input }).map((c) => c.title.id);

describe("nightCandidates", () => {
  it("takes every wishlist, or only the titles in common", () => {
    expect(ids({}).sort()).toEqual(["a", "b", "c"]);
    expect(ids({ match: "common" })).toEqual(["a"]);
  });

  it("takes one person's wishlist, or none", () => {
    expect(ids({ wishlist: "giu" }).sort()).toEqual(["a", "c"]);
    expect(ids({ wishlist: "none" })).toEqual([]);
  });

  it("adds the chosen playlists, still dropping what someone has seen", () => {
    expect(ids({ wishlist: "none", pickedSources: new Set([playlist.key]) })).toEqual(["p"]);
  });

  it("keeps only the chosen categories and genre", () => {
    expect(ids({ categories: new Set<MediaType>(["anime"]) })).toEqual(["c"]);
    expect(ids({ categories: new Set<MediaType>(["movie", "series"]) }).sort()).toEqual(["a", "b"]);
    expect(ids({ genre: "Crime" })).toEqual(["b"]);
  });
});

/** A title of the demo catalogue that neither of the two users has started. */
async function freshTitle(repo: MemoryRepository, type: Title["type"], ...users: string[]) {
  const libraries = await Promise.all(users.map((u) => repo.listLibrary(u)));
  const groups = (await Promise.all(users.map((u) => repo.listSharedWatches(u)))).flat();
  return (await repo.listTitles()).find(
    (t) => t.type === type && (t.type === "movie" || t.seasons.length > 0) && !libraries.some((l) => l.some((e) => e.titleId === t.id)) && !groups.some((g) => g.titleId === t.id),
  )!;
}

const night = (repo: MemoryRepository, t: Title, input: Partial<WatchParty> = {}) =>
  repo.createWatchParty({ hostId: "u_marco", participantIds: ["u_marco", "u_sara"], filter: "all", genre: null, candidateTitleIds: [t.id], pickedTitleId: t.id, status: "started", scheduledFor: null, ...input });
const place = async (repo: MemoryRepository, userId: string, titleId: string) => (await repo.listLibrary(userId)).find((e) => e.titleId === titleId);

describe("nights", () => {
  it("starting a night puts everyone on the title together, from the start", async () => {
    const repo = new MemoryRepository();
    const t = (await freshTitle(repo, "series", "u_marco", "u_sara")) as Series;
    await startNight(repo, await night(repo, t), t);
    for (const id of ["u_marco", "u_sara"]) {
      expect((await place(repo, id, t.id))?.status).toBe("watching");
      expect((await place(repo, id, t.id))?.progress).toMatchObject({ season: t.seasons[0]!.number, episode: 1 });
    }
    const group = (await repo.listSharedWatches("u_sara")).find((g) => g.titleId === t.id);
    expect(group?.memberIds.sort()).toEqual(["u_marco", "u_sara"]);
  });

  it("works for films too", async () => {
    const repo = new MemoryRepository();
    const t = await freshTitle(repo, "movie", "u_marco", "u_sara");
    await startNight(repo, await night(repo, t), t);
    expect((await place(repo, "u_sara", t.id))?.progress).toMatchObject({ season: null, episode: null, fraction: 0 });
  });

  it("starts a scheduled night only once its time comes", async () => {
    const repo = new MemoryRepository();
    const t = await freshTitle(repo, "series", "u_marco", "u_sara");
    const p = await night(repo, t, { status: "scheduled", scheduledFor: "2026-10-20T19:00:00.000Z" });
    expect(await activateNights(repo, "u_marco", new Date("2026-10-19T19:00:00.000Z"))).toBe(false);
    expect((await place(repo, "u_sara", t.id))).toBeUndefined();
    expect(await activateNights(repo, "u_marco", new Date("2026-10-20T19:01:00.000Z"))).toBe(true);
    expect((await repo.listWatchParties("u_marco", 10)).find((x) => x.id === p.id)?.status).toBe("started");
    expect((await place(repo, "u_sara", t.id))?.status).toBe("watching");
  });

  it("starts a queued night once the night before it is finished", async () => {
    const repo = new MemoryRepository();
    const first = (await freshTitle(repo, "series", "u_marco", "u_sara")) as Series;
    const p1 = await night(repo, first);
    await startNight(repo, p1, first);
    const second = (await repo.listTitles()).find((t) => t.type === "series" && t.id !== first.id && t.seasons.length > 0)!;
    const queued = await night(repo, second, { status: "queued" });
    expect(await activateNights(repo, "u_marco")).toBe(false);
    await repo.markFinished("u_marco", first.id, first.seasons.at(-1)!.number);
    expect(await activateNights(repo, "u_marco")).toBe(true);
    expect((await repo.listWatchParties("u_marco", 10)).find((x) => x.id === queued.id)?.status).toBe("started");
  });
});
