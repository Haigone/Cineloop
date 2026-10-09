import { describe, expect, it } from "vitest";
import type { LibraryEntry, Title } from "@/domain/types";
import { animeUnityResumeUrl, toContinueItem } from "@/server/services/shared";

const got = (providers: Title["providers"]): Title => ({
  id: "tmdb-tv-1399",
  type: "series",
  title: "Il trono di spade",
  originalTitle: "Game of Thrones",
  year: 2011,
  overview: "",
  genres: ["Fantasy"],
  communityRating: 8.4,
  providers,
  art: { palette: ["#000", "#111", "#222"] },
  seasons: [{ number: 1, episodeCount: 10 }],
  episodeRuntimeMinutes: 57,
} as unknown as Title);

const byHand: LibraryEntry = {
  userId: "u",
  titleId: "tmdb-tv-1399",
  status: "watching",
  addedAt: "2026-10-01T00:00:00.000Z",
  lastWatchedAt: "2026-10-01T00:00:00.000Z",
  rating: null,
  progress: { titleId: "tmdb-tv-1399", providerId: null, season: 1, episode: 3, fraction: 0.4, url: null, updatedAt: "2026-10-01T00:00:00.000Z" },
};

describe("Continua for progress set by hand", () => {
  it("opens a service the title streams on", () => {
    const item = toContinueItem(byHand, got(["now"]))!;
    expect(item).toMatchObject({ providerName: "NOW", continueUrl: "https://www.nowtv.it", continueOnSite: false });
  });

  it("with no service known, opens the title's page to see where it streams", () => {
    const item = toContinueItem(byHand, got([]))!;
    expect(item).toMatchObject({ providerName: null, continueUrl: "/title/tmdb-tv-1399", continueOnSite: true });
  });

  it("adds a one-shot resume fraction for a saved Anime Unity page", () => {
    const entry = { ...byHand, progress: { ...byHand.progress!, providerId: "animeunity" as const, url: "https://www.animeunity.so/anime/123-example" } };
    const item = toContinueItem(entry, got([]))!;
    expect(item.continueUrl).toBe("https://www.animeunity.so/anime/123-example?cineloopResume=0.4");
    expect(item.providerName).toBe("Anime Unity");
    expect(item.continueOnSite).toBe(false);
  });

  it("only adds the resume hint to Anime Unity HTTPS URLs", () => {
    expect(animeUnityResumeUrl("https://www.animeunity.so/anime/123", 1.4)).toBe("https://www.animeunity.so/anime/123?cineloopResume=1");
    expect(animeUnityResumeUrl("https://evil.example/anime/123", 0.5)).toBe("https://evil.example/anime/123");
  });
});
