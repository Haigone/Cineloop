import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { fillerListUrlFor, getAniDbAnimeForTmdb, parseAnnXml } from "@/integrations/catalog/anidb-first";
import { MemoryRepository } from "@/server/data/memory-repository";

describe("AniDB anime enrichment helpers", () => {
  it("parses ANN XML attributes, episodes, and picture attribution", () => {
    const parsed = parseAnnXml(42, '<anime id="42" name="A &amp; B" type="TV"><episode id="1"/><episode id="2"/><info type="Picture" src="https://example.test/poster.jpg"/></anime>');
    expect(parsed).toMatchObject({
      id: 42,
      title: "A & B",
      format: "TV",
      episodeCount: 2,
      pictureUrl: "https://example.test/poster.jpg",
      url: "https://www.animenewsnetwork.com/encyclopedia/anime.php?id=42",
    });
  });

  it("returns null for ANN error payloads instead of inventing metadata", () => {
    expect(parseAnnXml(42, '<error>Not found</error>')).toBeNull();
    expect(parseAnnXml(42, '<response/>')).toBeNull();
  });

  it("resolves AniDB identity through a typed TMDB cross-reference", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/api/map/tmdb/999999")) {
        return new Response(JSON.stringify({ anidb_id: [999999], tmdb_id: [{ id: 999999, type: "tv" }] }), { status: 200 });
      }
      if (url.includes("/api/anidb/999999")) {
        return new Response(JSON.stringify({ anidb_id: 999999, title: "Test Anime", title_english: "Test Anime", tmdb_ids: [{ id: 999999, type: "tv" }] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    }));
    try {
      await expect(getAniDbAnimeForTmdb(999999, "tv")).resolves.toMatchObject({ id: "anidb-999999", title: "Test Anime" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("syncs watched status to every included path but leaves skipped works untouched", async () => {
    const repository = new MemoryRepository();
    const now = new Date().toISOString();
    await repository.upsertAnimeWatchPath({ userId: "u_marco", rootId: "anidb-90000001", animeId: "anidb-90000002", included: true, role: "required", watched: false, updatedAt: now });
    await repository.upsertAnimeWatchPath({ userId: "u_marco", rootId: "anidb-90000003", animeId: "anidb-90000002", included: false, role: "skipped", watched: false, updatedAt: now });
    await repository.setAnimeWatchPathWatched("u_marco", "anidb-90000002", true);
    await expect(repository.listAnimeWatchPath("u_marco", "anidb-90000001")).resolves.toMatchObject([{ watched: true, role: "required" }]);
    await expect(repository.listAnimeWatchPath("u_marco", "anidb-90000003")).resolves.toMatchObject([{ watched: false, role: "skipped" }]);
  });

  it("only creates AnimeFillerList links for explicitly mapped titles", () => {
    expect(fillerListUrlFor("Bleach")).toBe("https://www.animefillerlist.com/shows/bleach");
    expect(fillerListUrlFor("Naruto Shippuden")).toBe("https://www.animefillerlist.com/shows/naruto-shippuden");
    expect(fillerListUrlFor("An unknown anime title")).toBeNull();
  });
});
