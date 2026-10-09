import { describe, expect, it } from "vitest";
import { PROVIDERS } from "@/domain/providers";
import type { ProviderId } from "@/domain/types";
import { getAdapter, resolveContinueUrl } from "@/integrations/providers/registry";
import type { SyncObservation } from "@/integrations/providers/types";

const ctx = (obs: SyncObservation | null) => ({ userId: "u", latestObservation: obs });
const netflixWatch: SyncObservation = { providerId: "netflix", url: "https://www.netflix.com/watch/80057281?trackId=1", documentTitle: "Stranger Things - Netflix", observedAt: "2026-10-08T20:00:00Z" };

describe("provider registry", () => {
  it("has an adapter for every provider", () => {
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) expect(getAdapter(id).id).toBe(id);
  });

  it("marks Anime Unity available while leaving Streaming Community disabled", () => {
    expect(PROVIDERS.animeunity).toMatchObject({ homepage: "https://www.animeunity.so", integration: "available" });
    expect(PROVIDERS.streamingcommunity).toMatchObject({ homepage: null, integration: "not-supported" });
  });
});

describe("Netflix adapter", () => {
  const netflix = getAdapter("netflix");

  it("reads the playback id from a /watch URL, and nothing from other pages", async () => {
    const current = await netflix.getCurrentContent(ctx(netflixWatch));
    expect(current).toMatchObject({ externalId: "80057281", title: "Stranger Things", url: "https://www.netflix.com/watch/80057281" });
    expect(await netflix.getCurrentContent(ctx({ ...netflixWatch, url: "https://www.netflix.com/browse" }))).toBeNull();
    expect(await netflix.getCurrentContent(ctx({ ...netflixWatch, url: "https://evil.example/www.netflix.com/watch/1" }))).toBeNull();
    expect(await netflix.getContinueWatching(ctx(netflixWatch))).toEqual([]);
  });

  it("does not take Netflix's generic tab title for a title name", async () => {
    const current = await netflix.getCurrentContent(ctx({ ...netflixWatch, documentTitle: "Netflix" }));
    expect(current?.title).toBe("");
  });

  it("keeps a show id only when it looks like one", async () => {
    const ok = await netflix.getCurrentContent(ctx({ ...netflixWatch, hints: { parentId: "80057281" } }));
    const bad = await netflix.getCurrentContent(ctx({ ...netflixWatch, hints: { parentId: "../x" } }));
    expect(ok?.parentId).toBe("80057281");
    expect(bad?.parentId).toBeNull();
  });

  it("links back to the title on Netflix when an id is known", () => {
    const content = { providerId: "netflix" as const, externalId: "80057281", title: "Stranger Things", type: null, season: null, episode: null, titleId: null };
    expect(netflix.getContentUrl(content)).toBe("https://www.netflix.com/watch/80057281");
    expect(netflix.getContentUrl({ ...content, externalId: null })).toBe("https://www.netflix.com");
  });
});

describe("Anime Unity adapter", () => {
  const adapter = getAdapter("animeunity");
  const observation: SyncObservation = {
    providerId: "animeunity",
    url: "https://www.animeunity.so/anime/123-example",
    documentTitle: "Example Anime - Anime Unity",
    hints: { title: "Example Anime", season: 1, episode: 4, progress: 0.42 },
    observedAt: "2026-10-09T12:00:00Z",
  };

  it("detects the active anime page, episode and playback fraction", async () => {
    const current = await adapter.getCurrentContent(ctx(observation));
    expect(current).toMatchObject({ providerId: "animeunity", externalId: observation.url, url: observation.url, title: "Example Anime", type: "anime", season: 1, episode: 4 });
    expect(await adapter.getWatchProgress(ctx(observation))).toMatchObject({ fraction: 0.42, content: { providerId: "animeunity", episode: 4 } });
    expect(adapter.capabilities).toEqual({ detectCurrentContent: true, deepLinks: true, progress: true });
  });

  it("rejects non-Anime Unity pages and hostname lookalikes", async () => {
    expect(await adapter.getCurrentContent(ctx({ ...observation, url: "http://www.animeunity.so/anime/123-example" }))).toBeNull();
    expect(await adapter.getCurrentContent(ctx({ ...observation, url: "https://evil.example/animeunity/anime/123" }))).toBeNull();
    expect(await adapter.getCurrentContent(ctx({ ...observation, url: "https://animeunity.so.evil.test/anime/123" }))).toBeNull();
    expect(await adapter.getCurrentContent(ctx({ ...observation, url: "https://www.animeunity.so/search?q=x" }))).toBeNull();
    expect(await adapter.getCurrentContent(ctx({ ...observation, providerId: "netflix" }))).toBeNull();
  });

  it("reopens only the stored HTTPS page URL", () => {
    const content = { providerId: "animeunity" as const, externalId: observation.url, title: "Example Anime", type: "anime" as const, season: 1, episode: 4, titleId: null };
    expect(resolveContinueUrl(content, null)).toBe(observation.url);
    expect(adapter.getContentUrl({ ...content, externalId: "https://evil.example/" })).toBeNull();
    expect(adapter.getContentUrl({ ...content, externalId: "javascript:alert(1)" })).toBeNull();
  });
});

describe("Streaming Community", () => {
  it("remains disabled and unchanged", async () => {
    const adapter = getAdapter("streamingcommunity");
    expect(adapter.capabilities).toEqual({ detectCurrentContent: false, deepLinks: false, progress: false });
    expect(await adapter.getCurrentContent(ctx({ ...netflixWatch, providerId: "streamingcommunity" }))).toBeNull();
    const content = { providerId: "streamingcommunity" as const, externalId: "1", title: "x", type: null, season: null, episode: null, titleId: null };
    expect(adapter.getContentUrl(content)).toBeNull();
    expect(resolveContinueUrl(content, null)).toBeNull();
    expect(PROVIDERS.streamingcommunity.homepage).toBeNull();
    expect(PROVIDERS.streamingcommunity.integration).toBe("not-supported");
  });
});
