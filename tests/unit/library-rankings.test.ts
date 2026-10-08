import { describe, expect, it } from "vitest";
import { countBy, filterLibrary, sortLibrary, type LibraryItem } from "@/domain/library";
import { filterNotifications } from "@/domain/notifications";
import { genreShares, ratingDistribution, socialRankings, topRated } from "@/domain/rankings";
import type { AppNotification, UserPreferences } from "@/domain/types";
import { entry, title, titleMap, user, wish } from "../fixtures";

const t = { a: title("Alba", "movie"), b: title("Bosco", "series"), c: title("Cielo", "anime") };
const items: LibraryItem[] = [
  { title: t.a, entry: entry("me", "Alba", "completed", 6, "2026-10-01T00:00:00Z") },
  { title: t.b, entry: entry("me", "Bosco", "watching", null, "2026-10-05T00:00:00Z") },
  { title: t.c, entry: entry("me", "Cielo", "completed", 9, null) },
];

describe("library filters and sorting", () => {
  it("filters by type and status together", () => {
    expect(filterLibrary(items, "all", "completed").map((i) => i.title.id)).toEqual(["Alba", "Cielo"]);
    expect(filterLibrary(items, "series", "all").map((i) => i.title.id)).toEqual(["Bosco"]);
    expect(filterLibrary(items, "movie", "watching")).toEqual([]);
  });

  it("sorts by recency, rating (unrated last) and title", () => {
    expect(sortLibrary(items, "recent").map((i) => i.title.id)).toEqual(["Bosco", "Alba", "Cielo"]);
    expect(sortLibrary(items, "rating").map((i) => i.title.id)).toEqual(["Cielo", "Alba", "Bosco"]);
    expect(sortLibrary(items, "title").map((i) => i.title.id)).toEqual(["Alba", "Bosco", "Cielo"]);
  });

  it("counts by key", () => {
    expect(countBy(items, (i) => i.entry.status)).toEqual({ completed: 2, watching: 1 });
  });
});

describe("rankings", () => {
  const titles = titleMap(t.a, t.b, t.c);
  it("ranks the viewer's own ratings per type", () => {
    const lib = [entry("me", "Alba", "completed", 6), entry("me", "Cielo", "completed", 9)];
    expect(topRated(lib, titles, "movie", 5).map((r) => [r.title.id, r.value])).toEqual([["Alba", 6]]);
    expect(topRated(lib, titles, "series", 5)).toEqual([]);
  });

  it("builds a 10-bucket rating distribution", () => {
    const d = ratingDistribution([entry("me", "Alba", "completed", 6), entry("me", "Cielo", "completed", 6), entry("me", "Bosco")]);
    expect(d).toHaveLength(10);
    expect(d[5]).toBe(2);
    expect(d.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it("turns a genre profile into shares that sum to at most 1", () => {
    const shares = genreShares(new Map([["Dramma", 3], ["Crime", 1]]), 5);
    expect(shares).toEqual([{ genre: "Dramma", share: 0.75 }, { genre: "Crime", share: 0.25 }]);
  });

  it("needs at least two friends to agree before something ranks", () => {
    const friends = [
      { user: user("giu"), library: [entry("giu", "Alba", "completed", 10), entry("giu", "Bosco", "completed", 4)], wishlist: [wish("giu", "Cielo")] },
      { user: user("luca"), library: [entry("luca", "Alba", "completed", 8)], wishlist: [wish("luca", "Cielo")] },
    ];
    const r = socialRankings(friends, titles, 5);
    expect(r.mostWatched.map((x) => x.title.id)).toEqual(["Alba"]);
    expect(r.bestRated).toEqual([expect.objectContaining({ value: 9, votes: 2 })]);
    expect(r.mostShared.map((x) => [x.title.id, x.friends.length])).toEqual([["Cielo", 2]]);
  });
});

describe("filterNotifications", () => {
  const n = (id: string, kind: AppNotification["kind"]): AppNotification => ({ id, kind, message: id, href: null, at: "2026-10-01T00:00:00Z", read: false });
  const prefs: UserPreferences = {
    userId: "me",
    profileVisibility: "friends",
    shareActivity: true,
    liveVisible: true,
    podium: [],
    notifyFriendActivity: false,
    notifyWatchParty: true,
    notifySuggestions: false,
    reduceMotion: false,
    subscriptions: [],
  };
  it("hides muted kinds but always keeps system messages", () => {
    const list = [n("1", "friend-activity"), n("2", "watch-party"), n("3", "suggestion"), n("4", "system")];
    expect(filterNotifications(list, prefs).map((x) => x.id)).toEqual(["2", "4"]);
  });
});

describe("seriesProgress", () => {
  it("counts earlier seasons, earlier episodes and the current one's fraction", async () => {
    const { seriesProgress } = await import("@/domain/library");
    const { SEED_TITLE_MAP } = await import("@/server/data/seed/catalog");
    const dark = SEED_TITLE_MAP.get("dark")!; // 10 + 8 + 8 episodes
    expect(seriesProgress(dark, { season: 2, episode: 3, fraction: 0.5 })).toBeCloseTo((10 + 2 + 0.5) / 26);
    expect(seriesProgress(dark, { season: null, episode: null, fraction: 0.5 })).toBeNull();
    expect(seriesProgress(SEED_TITLE_MAP.get("whiplash")!, { season: null, episode: null, fraction: 0.5 })).toBeNull();
  });
});

describe("onboarding pool", () => {
  it("is 10 to 20 Netflix series from the bundled catalog, no films", async () => {
    const { ONBOARDING_POOL } = await import("@/domain/onboarding");
    const { SEED_TITLE_MAP } = await import("@/server/data/seed/catalog");
    const ids = ONBOARDING_POOL.flatMap((g) => g.ids);
    expect(ids.length).toBeGreaterThanOrEqual(10);
    expect(ids.length).toBeLessThanOrEqual(20);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      const t = SEED_TITLE_MAP.get(id);
      expect(t, id).toBeDefined();
      expect(t!.type).not.toBe("movie");
      expect(t!.providers).toContain("netflix");
    }
  });
});
