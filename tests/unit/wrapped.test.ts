import { describe, expect, it } from "vitest";
import type { Title, WatchEvent } from "@/domain/types";
import { summarizeYear, wrappedYears } from "@/lib/wrapped";

const ev = (titleId: string, watchedAt: string, minutes: number, season: number | null = null, episode: number | null = null): WatchEvent => ({ userId: "u", titleId, watchedAt, minutes, season, episode });
const title = (id: string, name: string, type: "movie" | "series") => ({ id, title: name, type, artwork: { posterUrl: null } }) as unknown as Title;

describe("Wrapped", () => {
  const titles = new Map([
    ["a", title("a", "Outer Banks", "series")],
    ["b", title("b", "Il buco", "movie")],
  ]);
  const events = [ev("a", "2026-10-14T20:00:00Z", 50, 5, 1), ev("a", "2026-10-10T20:00:00Z", 40, 5, 2), ev("b", "2026-01-13T21:00:00Z", 100), ev("b", "2025-12-12T21:00:00Z", 90)];

  it("lists the years with viewing, latest first", () => {
    expect(wrappedYears(events)).toEqual([2026, 2025]);
  });

  it("adds up one year only", () => {
    const w = summarizeYear(2026, events, titles);
    expect(w).toMatchObject({ totalMinutes: 190, episodes: 2, films: 1, titles: 2, busiestMonth: 0 });
    expect(w.months[0]).toBe(100);
    expect(w.months[9]).toBe(90);
    expect(w.top.map((t) => [t.name, t.minutes, t.plays])).toEqual([["Il buco", 100, 1], ["Outer Banks", 90, 2]]);
  });

  it("is empty for a year without viewing", () => {
    expect(summarizeYear(2024, events, titles)).toMatchObject({ totalMinutes: 0, titles: 0, busiestMonth: null });
  });
});
