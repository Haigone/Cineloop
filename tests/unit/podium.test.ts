import { describe, expect, it } from "vitest";
import { buildPodiums, rankedInSection } from "@/domain/podium";
import type { LibraryEntry, Title } from "@/domain/types";

const t = (id: string, type: Title["type"]) => ({ id, type, title: id }) as Title;
const e = (titleId: string, rating: number | null) => ({ titleId, status: "completed", rating, lastWatchedAt: null }) as unknown as LibraryEntry;
const titles = new Map([t("f1", "movie"), t("f2", "movie"), t("s1", "series"), t("a1", "anime")].map((x) => [x.id, x]));
const library = [e("f1", 6), e("f2", 10), e("s1", 8), e("a1", 4)];

describe("buildPodiums", () => {
  it("keeps one podium per category, candidates best rated first", () => {
    const p = buildPodiums({ podium: [], podiums: { movie: ["f1", "f2"] } }, library, titles);
    expect(p.movie.picks.map((x) => x.title.id)).toEqual(["f1", "f2"]);
    expect(p.movie.candidates.map((x) => x.title.id)).toEqual(["f2", "f1"]);
    expect(p.series.picks).toEqual([]);
    expect(p.anime.candidates).toHaveLength(1);
  });
  it("sorts a podium chosen before categories into the category of each title", () => {
    const p = buildPodiums({ podium: ["s1", "f2", "a1"], podiums: {} }, library, titles);
    expect(p.movie.picks.map((x) => x.title.id)).toEqual(["f2"]);
    expect(p.series.picks.map((x) => x.title.id)).toEqual(["s1"]);
    expect(p.anime.picks.map((x) => x.title.id)).toEqual(["a1"]);
  });
});

describe("rankedInSection", () => {
  it("lists the podium first, then the best rated, only for the section", () => {
    const r = rankedInSection({ podium: [], podiums: { movie: ["f1"] } }, library, titles, "movie");
    expect(r.podium.map((x) => x.id)).toEqual(["f1"]);
    expect(r.rated.map((x) => x.id)).toEqual(["f2"]);
    expect(rankedInSection({ podium: [], podiums: {} }, library, titles, "series").rated.map((x) => x.id)).toEqual(["s1"]);
  });
  it("leaves out what was watched but never rated nor put on the podium", () => {
    const r = rankedInSection({ podium: [], podiums: {} }, [...library, e("f3", null)], new Map([...titles, ["f3", t("f3", "movie")]]), "movie");
    expect(r.rated.map((x) => x.id)).toEqual(["f2", "f1"]);
  });
});
