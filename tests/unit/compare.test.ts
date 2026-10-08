import { describe, expect, it } from "vitest";
import { compare, genreProfile, summarize, topGenres } from "@/domain/compare";
import { entry, title, titleMap, wish } from "../fixtures";

const titles = titleMap(title("m1", "movie", ["Thriller", "Crime"]), title("m2", "movie", ["Commedia"]), title("s1", "series", ["Thriller"]), title("an", "anime", ["Animazione"]));

describe("summarize", () => {
  it("counts watched titles per type, wishlist and average rating", () => {
    const s = summarize({ library: [entry("a", "m1", "completed", 8), entry("a", "s1", "watching", 6), entry("a", "m2", "planned")], wishlist: [wish("a", "an")] }, titles);
    expect(s).toEqual({ movies: 1, series: 1, anime: 0, wishlist: 1, averageRating: 7 });
  });

  it("reports no average without ratings", () => {
    expect(summarize({ library: [], wishlist: [] }, titles).averageRating).toBeNull();
  });
});

describe("genre profile", () => {
  it("weights the primary genre and liked titles more", () => {
    const p = genreProfile([entry("a", "m1", "completed", 10), entry("a", "m2", "completed", 2)], titles);
    expect(topGenres(p, 2)).toEqual(["Thriller", "Crime"]);
    expect(p.get("Thriller")).toBeGreaterThan(p.get("Commedia")!);
  });
});

describe("compare", () => {
  it("splits titles into common, both-want and one-sided", () => {
    const a = { library: [entry("a", "m1", "completed", 8), entry("a", "m2")], wishlist: [wish("a", "an"), wish("a", "s1")] };
    const b = { library: [entry("b", "m1", "completed", 9)], wishlist: [wish("b", "an")] };
    const c = compare(a, b, titles);
    expect(c.common.map((x) => [x.title.id, x.ratingA, x.ratingB])).toEqual([["m1", 8, 9]]);
    expect(c.bothWant.map((t) => t.id)).toEqual(["an"]);
    expect(c.onlyA.map((t) => t.id)).toContain("m2");
    expect(c.compatibility).toBeGreaterThanOrEqual(0);
    expect(c.compatibility).toBeLessThanOrEqual(100);
  });

  it("scores identical tastes higher than opposite ones", () => {
    const same = compare({ library: [entry("a", "m1", "completed", 9)], wishlist: [] }, { library: [entry("b", "m1", "completed", 9)], wishlist: [] }, titles);
    const apart = compare({ library: [entry("a", "m1", "completed", 10)], wishlist: [] }, { library: [entry("b", "m2", "completed", 2)], wishlist: [] }, titles);
    expect(same.compatibility).toBeGreaterThan(apart.compatibility);
  });
});
