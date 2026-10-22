import { describe, expect, it } from "vitest";
import type { Title, WatchEvent } from "@/domain/types";
import { summarizeByProvider, summarizeYear, wrappedYears } from "@/lib/wrapped";

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

  it("estimates plays recorded without minutes and says how much", () => {
    const t = new Map([["b", { id: "b", title: "Il buco", type: "movie", runtimeMinutes: 120, artwork: { posterUrl: null } } as unknown as Title], ["a", { id: "a", title: "OB", type: "series", episodeRuntimeMinutes: 50, artwork: { posterUrl: null } } as unknown as Title]]);
    const w = summarizeYear(2026, [ev("b", "2026-03-01T12:00:00Z", 0), ev("a", "2026-03-02T12:00:00Z", 0, 1), ev("a", "2026-03-03T12:00:00Z", 30, 1)], t);
    expect(w).toMatchObject({ totalMinutes: 200, estimatedMinutes: 170 });
  });

  it("splits provider statistics without changing general totals", () => {
  const events: WatchEvent[] = [
   { ...ev("a", "2026-02-01T12:00:00Z", 40, 1, 1), providerId: "netflix" },
   { ...ev("b", "2026-03-02T12:00:00Z", 100), providerId: "prime-video" },
   ev("a", "2026-04-03T12:00:00Z", 45, 1, 2),
  ];
  const providers = summarizeByProvider(2026, events, titles);
  const general = summarizeYear(2026, events, titles);
  expect(providers.map((p) => p.providerLabel)).toEqual(["Prime Video", "Servizio non specificato", "Netflix"]);
  expect(providers.reduce((n, p) => n + p.totalMinutes, 0)).toBe(general.totalMinutes);
  expect(providers.find((p) => p.providerId === "netflix")).toMatchObject({ episodes: 1, films: 0, firstWatched: "2026-02-01", lastWatched: "2026-02-01" });
 });

 it("is empty for a year without viewing", () => {
    expect(summarizeYear(2024, events, titles)).toMatchObject({ totalMinutes: 0, titles: 0, busiestMonth: null });
  });

  it("counts the ~10 minute chunks of one episode as one play, capped at its length", () => {
    const t = new Map([["a", { id: "a", title: "OB", type: "series", episodeRuntimeMinutes: 45, artwork: { posterUrl: null } } as unknown as Title]]);
    const chunks = Array.from({ length: 8 }, (_, n) => ({ ...ev("a", `2026-10-14T20:0${n}:00Z`, 10, 1, 3), providerId: "netflix" as const }));
    const w = summarizeYear(2026, [...chunks, { ...ev("a", "2026-10-15T20:00:00Z", 20, 1, 4), providerId: "netflix" as const }], t);
    expect(w).toMatchObject({ episodes: 2, totalMinutes: 65, estimatedMinutes: 0 });
  });

  it("does not add a Netflix history import on top of measured viewing of the same day", () => {
    const t = new Map([["a", { id: "a", title: "OB", type: "series", episodeRuntimeMinutes: 45, artwork: { posterUrl: null } } as unknown as Title]]);
    const imported = { ...ev("a", "2026-10-14T12:00:00.000Z", 0, 1), providerId: "netflix" as const };
    const measured = { ...ev("a", "2026-10-14T20:00:00.000Z", 40, 1, 2), providerId: "netflix" as const };
    expect(summarizeYear(2026, [imported, measured], t)).toMatchObject({ episodes: 1, totalMinutes: 40 });
  });
});
