import { describe, expect, it } from "vitest";
import type { LibraryEntry, Title } from "@/domain/types";
import { airedSeasons, finishesTitle, newSeasons } from "@/domain/library";

const series = {
  id: "tmdb-tv-94605",
  type: "series",
  title: "Arcane",
  seasons: [
    { number: 1, episodeCount: 9, airDate: "2021-11-06" },
    { number: 2, episodeCount: 9, airDate: "2024-11-09" },
    { number: 3, episodeCount: 0 },
    { number: 4, episodeCount: 8, airDate: "2027-01-01" },
  ],
} as unknown as Title;

const entry = (patch: Partial<LibraryEntry>): LibraryEntry => ({
  userId: "u",
  titleId: series.id,
  status: "completed",
  addedAt: "2024-01-01T00:00:00.000Z",
  lastWatchedAt: null,
  rating: null,
  progress: null,
  seenThrough: 1,
  ...patch,
});

describe("Novità", () => {
  it("counts only seasons already out", () => {
    expect(airedSeasons(series, "2026-10-09").map((s) => s.number)).toEqual([1, 2]);
  });

  it("lists the seasons after the one the user had finished", () => {
    expect(newSeasons(entry({}), series, "2026-10-09").map((s) => s.number)).toEqual([2]);
    expect(newSeasons(entry({}), series, "2027-02-01").map((s) => s.number)).toEqual([2, 4]);
  });

  it("ignores series up to date, being watched or without a known season", () => {
    expect(newSeasons(entry({ seenThrough: 2 }), series, "2026-10-09")).toEqual([]);
    expect(newSeasons(entry({ status: "watching" }), series, "2026-10-09")).toEqual([]);
    expect(newSeasons(entry({ seenThrough: null }), series, "2026-10-09")).toEqual([]);
  });
});

describe("finishing a title", () => {
  it("is the end of the last aired episode, or nearly the end of a film", () => {
    const today = "2026-10-09";
    expect(finishesTitle(series, { season: 2, episode: 9, fraction: 0.92 }, today)).toBe(true);
    expect(finishesTitle(series, { season: 2, episode: 9, fraction: 0.5 }, today)).toBe(false);
    expect(finishesTitle(series, { season: 1, episode: 9, fraction: 1 }, today)).toBe(false);
    expect(finishesTitle({ type: "movie" } as Title, { season: null, episode: null, fraction: 0.9 }, today)).toBe(true);
  });
});
