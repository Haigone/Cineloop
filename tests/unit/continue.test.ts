import { describe, expect, it } from "vitest";
import type { LibraryEntry, Title } from "@/domain/types";
import { toContinueItem } from "@/server/services/shared";

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
});
