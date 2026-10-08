import { describe, expect, it } from "vitest";
import { computeWeeklyStats, dailyMinutes } from "@/domain/stats";
import type { WatchEvent } from "@/domain/types";
import { entry, title, titleMap, wish } from "../fixtures";

const now = new Date("2026-10-08T20:00:00");
const daysAgo = (d: number, h = 0) => new Date(now.getTime() - d * 86_400_000 - h * 3_600_000).toISOString();
const ev = (titleId: string, at: string, minutes: number): WatchEvent => ({ userId: "a", titleId, watchedAt: at, minutes, season: null, episode: null });

const titles = titleMap(title("film", "movie", ["Thriller"]), title("show", "series", ["Commedia", "Thriller"]));

describe("computeWeeklyStats", () => {
  it("sums the last seven days and ignores older events", () => {
    const s = computeWeeklyStats({
      now,
      events: [ev("film", daysAgo(1), 120), ev("show", daysAgo(2), 30), ev("show", daysAgo(2, 1), 30), ev("film", daysAgo(9), 500)],
      library: [entry("a", "film", "completed", null, daysAgo(1)), entry("a", "show", "completed", null, daysAgo(20))],
      wishlist: [{ ...wish("a", "show"), addedAt: daysAgo(3) }],
      titles,
    });
    expect(s).toEqual({ minutes: 180, movies: 1, episodes: 2, completed: 1, wishlisted: 1, topGenre: "Thriller" });
  });

  it("has no top genre without events", () => {
    expect(computeWeeklyStats({ now, events: [], library: [], wishlist: [], titles }).topGenre).toBeNull();
  });
});

describe("dailyMinutes", () => {
  it("buckets minutes by calendar day, oldest first, today last", () => {
    const days = dailyMinutes([ev("film", daysAgo(0, 1), 40), ev("film", daysAgo(0, 2), 20), ev("show", daysAgo(6), 45), ev("show", daysAgo(7), 99)], now);
    expect(days).toHaveLength(7);
    expect(days[6]).toBe(60);
    expect(days[0]).toBe(45);
    expect(days.reduce((a, b) => a + b, 0)).toBe(105);
  });
});
