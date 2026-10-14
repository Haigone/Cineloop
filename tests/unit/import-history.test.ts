import { describe, expect, it } from "vitest";
import { getRepository } from "@/server/data";
import { cacheTitles } from "@/server/services/explore";
import { importNetflixHistory } from "@/server/services/import-history";

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
    expect(again).toEqual({ added: [], already: 1, notFound: [] });
    expect((await repo.listLibrary("u_elena")).find((e) => e.titleId === "arcane")).toEqual(arcane);
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
    expect(res).toEqual({ added: [], already: 1, notFound: [] });
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
