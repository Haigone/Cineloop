import { describe, expect, it } from "vitest";
import { groupRows, readYears, summarize, type GroupResult } from "@/lib/wrapped";

const CSV = `Title,Date
"Outer Banks: Stagione 5: La scitala","10/14/26"
"Outer Banks: Stagione 5: La soffiata","10/10/26"
"La leggenda di Al, John e Jack","1/13/26"
"Perfetti sconosciuti","12/12/25"`;

describe("Wrapped", () => {
  it("splits the history by year and month", () => {
    const years = readYears(CSV)!;
    expect([...years.keys()].sort()).toEqual([2025, 2026]);
    expect(years.get(2026)!.map((r) => r.month)).toEqual([10, 10, 1]);
  });

  it("reads day-first dates when the file shows one", () => {
    const years = readYears('Title,Date\n"A","14/10/26"\n"B","3/4/26"')!;
    expect(years.get(2026)!.map((r) => r.month)).toEqual([10, 4]);
  });

  it("rejects other files", () => {
    expect(readYears("Name,Value\na,b")).toBeNull();
  });

  it("uses a play's own duration and drops trailers", () => {
    const years = readYears('Start Time,Duration,Title,Supplemental Video Type\n2026-03-01 20:00:00,00:45:00,"X: Stagione 1: Uno",\n2026-03-02 20:00:00,00:00:30,"X: Stagione 1: Trailer",\n2026-03-03 20:00:00,00:30:00,"X: Stagione 1: Extra",TRAILER')!;
    expect(years.get(2026)).toEqual([{ raw: "X: Stagione 1: Uno", month: 3, seconds: 2700 }]);
  });

  it("groups episodes under their series and adds up the minutes", () => {
    const rows = readYears(CSV)!.get(2026)!;
    const groups = groupRows(rows);
    expect(groups.map((g) => [g.title, g.rows.length, g.rows[0]!.episode])).toEqual([
      ["Outer Banks", 2, "La scitala"],
      ["La leggenda di Al, John e Jack", 1, ""],
    ]);
    const results: GroupResult[] = [
      { name: "Outer Banks", posterUrl: null, found: true, isFilm: false, plays: [{ minutes: 50, estimated: false }, { minutes: 40, estimated: true }] },
      { name: "La leggenda", posterUrl: null, found: false, isFilm: true, plays: [{ minutes: 100, estimated: true }] },
    ];
    const w = summarize(2026, groups, results);
    expect(w).toMatchObject({ totalMinutes: 190, estimatedMinutes: 140, episodes: 2, films: 1, titles: 2, busiestMonth: 0, notFound: ["La leggenda di Al, John e Jack"] });
    expect(w.top[0]!.name).toBe("La leggenda");
    expect(w.months[0]).toBe(100);
  });
});
