import { describe, expect, it } from "vitest";
import { compatibleTitles, pickWinner, sourceKey, toPartyMember, wantedFrom, wheelSample, type PartySource } from "@/domain/watch-party";
import { entry, title, user, wish } from "../fixtures";

const titles = [title("a"), title("b", "series", ["Crime"]), title("c", "anime", ["Animazione"]), title("d"), title("seen")];
const me = toPartyMember(user("me"), [entry("me", "seen")], [wish("me", "a"), wish("me", "b"), wish("me", "seen")]);
const giu = toPartyMember(user("giu"), [], [wish("giu", "a"), wish("giu", "c")]);
const luca = toPartyMember(user("luca"), [entry("luca", "d", "watching")], [wish("luca", "a"), wish("luca", "d")]);

describe("compatibleTitles", () => {
  it("drops anything a member has already seen or is watching", () => {
    const ids = compatibleTitles({ members: [me, giu, luca], titles, filter: "all", genre: null }).map((c) => c.title.id);
    expect(ids).not.toContain("seen");
    expect(ids).not.toContain("d");
  });

  it("'common' keeps titles at least half the group wants", () => {
    const res = compatibleTitles({ members: [me, giu, luca], titles, filter: "common", genre: null });
    expect(res.map((c) => c.title.id)).toEqual(["a"]);
    expect(res[0]!.match).toBe(1);
    expect(res[0]!.wantedBy.map((u) => u.id)).toEqual(["me", "giu", "luca"]);
  });

  it("filters by type and genre, best match first", () => {
    expect(compatibleTitles({ members: [me, giu], titles, filter: "anime", genre: null }).map((c) => c.title.id)).toEqual(["c"]);
    expect(compatibleTitles({ members: [me, giu], titles, filter: "all", genre: "Crime" }).map((c) => c.title.id)).toEqual(["b"]);
    expect(compatibleTitles({ members: [me, giu], titles, filter: "all", genre: null })[0]!.title.id).toBe("a");
  });

  it("returns nothing for an empty group", () => {
    expect(compatibleTitles({ members: [], titles, filter: "all", genre: null })).toEqual([]);
  });
});

describe("pickWinner", () => {
  it("maps the random draw onto an index and never overflows", () => {
    expect(pickWinner(["x", "y", "z"], () => 0)).toBe(0);
    expect(pickWinner(["x", "y", "z"], () => 0.5)).toBe(1);
    expect(pickWinner(["x", "y", "z"], () => 0.99999)).toBe(2);
    expect(pickWinner(["x"], () => 1)).toBe(0);
    expect(pickWinner([], () => 0.3)).toBe(-1);
  });
});

describe("lists of a night", () => {
  const sources: PartySource[] = [
    { key: sourceKey("me", "wishlist"), ownerId: "me", kind: "wishlist", label: "Wishlist", titleIds: ["a", "b"] },
    { key: sourceKey("me", "pl1"), ownerId: "me", kind: "playlist", label: "Natale", titleIds: ["b", "x"] },
    { key: sourceKey("giu", "wishlist"), ownerId: "giu", kind: "wishlist", label: "Wishlist", titleIds: ["a", "c"] },
  ];

  it("brings the union of the lists picked for each person", () => {
    const picked = new Set([sourceKey("me", "pl1"), sourceKey("giu", "wishlist")]);
    expect(wantedFrom("me", sources, picked).sort()).toEqual(["b", "x"]);
    expect(wantedFrom("giu", sources, picked).sort()).toEqual(["a", "c"]);
    expect(wantedFrom("luca", sources, picked)).toEqual([]);
  });

  it("combines a kind with 'common only'", () => {
    const res = compatibleTitles({ members: [me, giu, luca], titles, filter: "anime", commonOnly: true, genre: null });
    expect(res).toEqual([]);
    expect(compatibleTitles({ members: [me, giu], titles, filter: "series", commonOnly: false, genre: null }).map((c) => c.title.id)).toEqual(["b"]);
  });

  it("is not capped at a dozen titles", () => {
    const many = Array.from({ length: 100 }, (_, i) => title(`t${i}`));
    const solo = toPartyMember(user("me"), [], many.map((t) => wish("me", t.id)));
    expect(compatibleTitles({ members: [solo], titles: many, filter: "all", genre: null })).toHaveLength(100);
  });
});

describe("wheelSample", () => {
  const all = Array.from({ length: 100 }, (_, i) => i);
  it("always holds the winner, at the index it reports", () => {
    for (const w of [0, 37, 99]) {
      const { items, index } = wheelSample(all, w, 20);
      expect(items).toHaveLength(20);
      expect(items[index]).toBe(w);
      expect(new Set(items).size).toBe(20);
    }
  });
  it("shows everything when it fits", () => {
    expect(wheelSample([1, 2, 3], 1, 20)).toEqual({ items: [1, 2, 3], index: 1 });
  });
});
