import { describe, expect, it } from "vitest";
import { pickForTonight } from "@/domain/recommend";
import { entry, title, titleMap, user, wish } from "../fixtures";

const titles = titleMap(
  title("wanted", "series"),
  title("suggested", "series"),
  title("loved", "movie"),
  title("seen", "movie"),
  title("netflix-film", "movie", ["Dramma"], { providers: ["netflix"] }),
  title("other-film", "movie", ["Dramma"], { providers: ["now"] }),
);
const giulia = { user: user("giulia"), library: [entry("giulia", "loved", "completed", 9), entry("giulia", "seen", "completed", 10)], wishlist: [wish("giulia", "wanted")] };

describe("pickForTonight", () => {
  it("never suggests something already watched", () => {
    const picks = pickForTonight({ library: [entry("me", "seen")], wishlist: [wish("me", "seen")], friends: [giulia], titles, limit: 10 });
    expect(picks.map((p) => p.title.id)).not.toContain("seen");
  });

  it("explains each pick and flags friends who want it too", () => {
    const picks = pickForTonight({
      library: [],
      wishlist: [wish("me", "wanted", 0), wish("me", "suggested", 1, "giulia")],
      friends: [giulia],
      titles,
      limit: 10,
    });
    const byId = new Map(picks.map((p) => [p.title.id, p]));
    expect(byId.get("wanted")!.reason).toEqual({ kind: "wishlist" });
    expect(byId.get("wanted")!.sharedWith.map((u) => u.id)).toEqual(["giulia"]);
    expect(byId.get("suggested")!.reason).toMatchObject({ kind: "suggested", by: { id: "giulia" } });
    expect(byId.get("loved")!.reason).toMatchObject({ kind: "friends-loved" });
    // Own wishlist outranks things only friends liked.
    expect(picks[0]!.title.id).toBe("wanted");
  });

  it("favours titles on the services the viewer uses", () => {
    const input = { library: [], wishlist: [wish("me", "other-film", 0), wish("me", "netflix-film", 0)], friends: [], titles, limit: 2 };
    expect(pickForTonight({ ...input, subscriptions: ["netflix"] })[0]!.title.id).toBe("netflix-film");
    expect(pickForTonight({ ...input, subscriptions: ["now"] })[0]!.title.id).toBe("other-film");
  });
});
