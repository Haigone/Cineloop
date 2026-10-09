import { describe, expect, it } from "vitest";
import { getAdapter, resolveContinueUrl } from "@/integrations/providers/registry";
import type { SyncObservation } from "@/integrations/providers/types";

const observation: SyncObservation = {
  providerId: "animeunity",
  url: "https://www.animeunity.example/anime/123",
  documentTitle: "Example Anime - Anime Unity",
  hints: { title: "Example Anime", season: 1, episode: 4 },
  observedAt: "2026-10-09T12:00:00Z",
};

describe("Anime Unity page links", () => {
  const adapter = getAdapter("animeunity");
  const context = (latestObservation: SyncObservation | null) => ({ userId: "test-user", latestObservation });

  it("recognizes an observed HTTPS page and preserves its URL", async () => {
    const current = await adapter.getCurrentContent(context(observation));
    expect(current).toMatchObject({
      providerId: "animeunity",
      externalId: observation.url,
      url: observation.url,
      title: "Example Anime",
      type: "anime",
      season: 1,
      episode: 4,
    });
  });

  it("rejects lookalike domains, HTTP, and observations from other providers", async () => {
    expect(await adapter.getCurrentContent(context({ ...observation, url: "http://www.animeunity.example/watch/1" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, url: "https://evil.example/animeunity/watch/1" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, url: "https://animeunity.example.evil.test/watch/1" }))).toBeNull();
    expect(await adapter.getCurrentContent(context({ ...observation, providerId: "netflix" }))).toBeNull();
  });

  it("reopens only a saved HTTPS page URL for the same provider", () => {
    const content = {
      providerId: "animeunity" as const,
      externalId: observation.url,
      title: "Example Anime",
      type: "anime" as const,
      season: 1,
      episode: 4,
      titleId: null,
    };
    expect(resolveContinueUrl(content, null)).toBe(observation.url);
    expect(adapter.getContentUrl({ ...content, externalId: "https://evil.example/" })).toBeNull();
    expect(adapter.getContentUrl({ ...content, externalId: "javascript:alert(1)" })).toBeNull();
    expect(adapter.capabilities.progress).toBe(false);
  });
});
