import { describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";
import { cacheTitles } from "@/server/services/explore";
import { importNetflixHistory, withoutRepeats } from "@/server/services/import-history";

describe("importing the Netflix viewing history", () => {
  it("adds what is missing from the library, leaves the rest, logs what it cannot match", async () => {
    const repo = getRepository();
    const before = new Set((await repo.listLibrary("u_elena")).map((e) => e.titleId));
    const res = await importNetflixHistory("u_elena", [
      { title: "Arcane", kind: "series", season: 2, sample: "Arcane: Stagione 2: Atto III" },
      { title: "Parasite", kind: "film", sample: "Parasite" },
      { title: "Dark", kind: "unknown", sample: "Dark: Segreti" },
      { title: "Una serie che non esiste", kind: "series", season: 1, sample: "Una serie che non esiste: Stagione 1: Pilota" },
    ]);
    expect(res.notFound).toEqual([{ title: "Una serie che non esiste", sample: "Una serie che non esiste: Stagione 1: Pilota" }]);
    expect(res.added.length + res.already).toBe(3);
    const after = await repo.listLibrary("u_elena");
    const arcane = after.find((e) => e.titleId === "arcane");
    expect(arcane).toBeDefined();
    if (!before.has("arcane")) expect(arcane).toMatchObject({ status: "completed", seenThrough: 2 });
    expect(after.some((e) => e.titleId === "parasite")).toBe(true);
    expect(after.some((e) => e.titleId === "dark")).toBe(true);
    // Again: nothing new, nothing changed.
    const again = await importNetflixHistory("u_elena", [{ title: "Arcane", kind: "series", season: 1, sample: "Arcane: Stagione 1: Atto I" }]);
    expect(again).toEqual({ added: [], days: 0, already: 1, notFound: [] });
    expect((await repo.listLibrary("u_elena")).find((e) => e.titleId === "arcane")).toEqual(arcane);
  });
});

describe("importing the history records when it was watched", () => {
  it("records dated plays without inventing duration, tops up on a second import, never doubles", async () => {
    const repo = getRepository();
    const item = (n: number) => ({
      title: "Arcane",
      kind: "series" as const,
      season: 2,
      sample: "Arcane: Stagione 2: Atto I",
      watched: [{ d: "2024-03-01", s: 1, n }, { d: "2024-03-09", s: 2, n: 1 }],
    });
    const first = await importNetflixHistory("u_marco", [item(3)]);
    expect(first.days).toBe(4);
    expect((await importNetflixHistory("u_marco", [item(3)])).days).toBe(0);
    expect((await importNetflixHistory("u_marco", [item(5)])).days).toBe(2);
    const events = (await repo.listWatchEvents("u_marco", new Date(0))).filter((e) => e.watchedAt.startsWith("2024-03"));
    expect(events).toHaveLength(6);
    expect(events.every((e) => e.minutes === 0 && e.providerId === "netflix")).toBe(true);
  });
  it("uses a legacy zero-minute day as an already-imported play when the season is now known", async () => {
    const repo = getRepository();
    await repo.addWatchEvent({
      userId: "u_wrapped_legacy",
      titleId: "arcane",
      watchedAt: "2019-02-14T12:00:00.000Z",
      minutes: 0,
      season: null,
      episode: null,
      providerId: "netflix",
    });
    const result = await importNetflixHistory("u_wrapped_legacy", [{
      title: "Arcane",
      kind: "series",
      season: 1,
      sample: "Arcane: Stagione 1: Atto I",
      watched: [{ d: "2019-02-14", s: 1, n: 2 }],
    }]);
    expect(result.days).toBe(1);
    const sameDay = (await repo.listWatchEvents("u_wrapped_legacy", new Date("2019-02-14T00:00:00.000Z")))
      .filter((event) => event.watchedAt.startsWith("2019-02-14"));
    expect(sameDay).toHaveLength(2);
  });
});

describe("importing the history never duplicates a show", () => {
  it("counts a show already in the library under another catalogue id as already there", async () => {
    const repo = getRepository();
    const [arcane] = await repo.getTitlesByIds(["arcane"]);
    // The same series as cached from another source (TMDB, ANN), with its own id.
    await cacheTitles(repo, [{ ...arcane!, id: "tmdb-tv-94605" }]);
    await repo.setLibraryStatus("u_davide", "tmdb-tv-94605", "watching");
    const res = await importNetflixHistory("u_davide", [{ title: "Arcane", kind: "series", season: 2, sample: "Arcane: Stagione 2: Atto I" }]);
    expect(res).toEqual({ added: [], days: 0, already: 1, notFound: [] });
    expect((await repo.listLibrary("u_davide")).filter((e) => e.titleId === "arcane" || e.titleId === "tmdb-tv-94605")).toHaveLength(1);
  });
});

describe("importing the history picks the right namesake", () => {
  it("takes the cached title with a poster over a poster-less stub of the same name", async () => {
    const repo = getRepository();
    const [parasite] = await repo.getTitlesByIds(["parasite"]);
    const art = parasite!.artwork;
    await cacheTitles(repo, [
      { ...parasite!, id: "tmdb-movie-900001", artwork: { ...art, posterUrl: null } },
      { ...parasite!, id: "tmdb-movie-496243", artwork: { ...art, posterUrl: "https://image.tmdb.org/t/p/w500/p.jpg" } },
    ]);
    const res = await importNetflixHistory("u_namesake", [{ title: "Parasite", kind: "film", sample: "Parasite" }]);
    expect(res.added).toHaveLength(1);
    const ids = (await repo.listLibrary("u_namesake")).map((e) => e.titleId);
    expect(ids).toContain("tmdb-movie-496243");
    expect(ids).not.toContain("tmdb-movie-900001");
  });
});

describe("importing a long history in time", () => {
  it("with its time budget spent, answers with what it did and hands back the rest as pending", async () => {
    const items = ["Arcane", "Parasite", "Dark", "Frieren", "Shogun", "Severance"].map((title) => ({ title, kind: "film" as const, sample: title }));
    const res = await importNetflixHistory("u_budget", items, 0);
    // The first few are always looked at, so every request moves the import forward.
    expect(res.added.length + res.already + res.notFound.length).toBe(4);
    expect(res.pending?.map((p) => p.title)).toEqual(["Shogun", "Severance"]);
    // Without a budget (an older extension), everything in one go and no pending.
    expect((await importNetflixHistory("u_budget2", items)).pending).toBeUndefined();
  });
});

describe("names Netflix writes twice", () => {
  it("drops the show's name when Netflix repeats it", () => {
    expect(withoutRepeats("Avatar - La leggenda di Aang: Avatar - La leggenda di Aang: Libro primo")).toBe("Avatar - La leggenda di Aang: Libro primo");
    expect(withoutRepeats("Dark: Segreti")).toBe("Dark: Segreti");
  });
});
