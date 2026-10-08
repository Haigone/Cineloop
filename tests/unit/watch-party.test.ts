import { describe, expect, it } from "vitest";
import { compatibleTitles, pickWinner, toPartyMember } from "@/domain/watch-party";
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
