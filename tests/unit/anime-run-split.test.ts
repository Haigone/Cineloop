import { describe, expect, it } from "vitest";
import { buildFranchise, runOffset, withinEntry } from "@/integrations/anime/franchise";
import type { FillerList } from "@/integrations/anime/filler-list";
import type { AnimeEntry } from "@/integrations/anime/types";

const tv = (id: string, start: string, episodes: number | null): AnimeEntry => ({
  id, name: "One Piece", type: "TV", start, episodes, runtimeMinutes: 24, plot: "", picture: null, genres: [], related: [], episodeNames: [],
});
const noFillers = { kindsOf: async () => new Map() } as unknown as FillerList;

describe("a long run that ANN splits into entries of one name", () => {
  const entries = new Map([tv("836", "1999-10-20", 1155), tv("30000", "2026-04-05", 1180), tv("31000", "2027", null)].map((e) => [e.id, e]));

  it("counts a later entry's run-wide number from its own first episode", () => {
    expect(runOffset(entries, entries.get("836")!)).toBe(0);
    expect(runOffset(entries, entries.get("30000")!)).toBe(1155);
    expect(withinEntry(1180, 1155)).toBe(25);
    // Already counted from its own start (Black Clover's 12 after 170): left alone.
    expect(withinEntry(12, 170)).toBe(12);
  });

  it("does not add the whole run twice to the seasons", async () => {
    const f = (await buildFranchise(entries, noFillers))!;
    expect(f.title.type === "anime" && f.title.seasons.map((s) => s.episodeCount)).toEqual([1155, 25, 0]);
  });
});
