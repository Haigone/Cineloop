import { describe, expect, it } from "vitest";
import { getAdapter, resolveContinueUrl } from "@/integrations/providers/registry";
import { animeUnityPartSeason } from "@/integrations/providers/adapters/anime-unity";
import type { SyncObservation } from "@/integrations/providers/types";

const observation: SyncObservation = {
  providerId: "animeunity",
  url: "https://www.animeunity.so/anime/123-example",
  documentTitle: "Example Anime - Anime Unity",
  hints: { title: "Example Anime", season: 1, episode: 4, progress: 0.42 },
  observedAt: "2026-10-09T12:00:00Z",
};

describe("Anime Unity part-to-season mapping", () => {
  it("maps Bleach TYBW parts to canonical seasons", () => {
    expect(animeUnityPartSeason("https://www.animeunity.so/anime/1-bleach-the-blood-warfare/1", "Bleach: The Blood Warfare")).toBe(1);
    expect(animeUnityPartSeason("https://www.animeunity.so/anime/2-bleach-the-separation/2", "Bleach: The Separation")).toBe(2);
    expect(animeUnityPartSeason("https://www.animeunity.so/anime/5663-bleach-thousand-year-blood-war-the-conflict/87224", "Bleach: Thousand-Year Blood War - The Conflict")).toBe(3);
    expect(animeUnityPartSeason("https://www.animeunity.so/anime/4-bleach-the-calamity/4", "Bleach: The Calamity")).toBe(4);
  });

  it("does not infer a season without an explicit part marker", () => {
    expect(animeUnityPartSeason("https://www.animeunity.so/anime/123-example", "Example Anime")).toBeNull();
  });
});

describe("Anime Unity page links", () => {
  const adapter = getAdapter("animeunity");
  const context = (latestObservation: SyncObservation | null) => ({ userId: "test-user", latestObservation });

  it("recognizes a real Anime Unity anime page and its progress", async () => {
    const current = await adapter.getCurrentContent(context(observation));
    expect(current).toMatchObject({ providerId: "animeunity", externalId: observation.url, url: observation.url, title: "Example Anime", type: "anime", season: 1, episode: 4 });
    expect(await adapter.getWatchProgress(context(observation))).toMatchObject({ fraction: 0.42 });
    expect(adapter.capabilities).toEqual({ detectCurrentContent: true, deepLinks: true, progress: true });
  });

  it("infers the part season from the AnimeUnity URL when the page hint omits it", async () => {
    const current = await adapter.getCurrentContent(context({
      ...observation,
      url: "https://www.animeunity.so/anime/5663-bleach-thousand-year-blood-war-the-conflict/87224",
      hints: { title: "Bleach: Thousand-Year Blood War - The Conflict", episode: 14 },
    }));
    expect(current).toMatchObject({ season: 3, episode: 14 });
  });

  it("rejects lookalike domains, HTTP and non-anime pages", async () => {
    expect(await adapter.getCurrentContent(context({ ...observation, url: "http://www.animeunity.so/anime/1" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, url: "https://evil.example/animeunity/anime/1" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, url: "https://animeunity.so.evil.test/anime/1" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, url: "https://www.animeunity.so/search?q=x" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, providerId: "netflix" }))).toBeNull();
  });

  it("reopens only the saved HTTPS page URL", () => {
    const content = { providerId: "animeunity" as const, externalId: observation.url, title: "Example Anime", type: "anime" as const, season: 1, episode: 4, titleId: null };
    expect(resolveContinueUrl(content, null)).toBe(observation.url);
    expect(adapter.getContentUrl({ ...content, externalId: "https://evil.example/" })).toBeNull();
    expect(adapter.getContentUrl({ ...content, externalId: "javascript:alert(1)" })).toBeNull();
  });
});
