import type {
  ActivityEvent,
  AppNotification,
  LibraryEntry,
  ProviderId,
  RatingValue,
  User,
  UserPreferences,
  WatchEvent,
  WishlistItem,
} from "@/domain/types";
import { SEED_TITLE_MAP } from "./catalog";

/**
 * Demo people and their history. Dates are generated relative to `now` so
 * "this week" always has data, whenever the demo runs.
 */

export const DEMO_PASSWORD = "cineloop-demo";
export const DEMO_EMAIL = "marco@cineloop.dev";

interface WatchingSeed {
  id: string;
  provider: ProviderId;
  season?: number;
  episode?: number;
  fraction: number;
  hoursAgo: number;
}

interface PersonSeed {
  user: Omit<User, "createdAt">;
  watching: WatchingSeed[];
  /** [titleId, rating 1–10, days ago completed] */
  completed: [string, RatingValue, number][];
  planned: string[];
  wishlist: string[];
}

const PEOPLE: PersonSeed[] = [
  {
    user: {
      id: "u_marco",
      username: "marco",
      displayName: "Marco Bianchi",
      email: DEMO_EMAIL,
      avatarUrl: null,
      bio: "Thriller lenti, anime lunghi, finali che fanno discutere.",
    },
    watching: [
      { id: "stranger-things", provider: "netflix", season: 4, episode: 3, fraction: 0.61, hoursAgo: 2 },
      { id: "the-last-of-us", provider: "now", season: 2, episode: 4, fraction: 0.72, hoursAgo: 26 },
      { id: "the-boys", provider: "prime-video", season: 4, episode: 3, fraction: 0.38, hoursAgo: 50 },
      { id: "attack-on-titan", provider: "crunchyroll", season: 4, episode: 12, fraction: 0.54, hoursAgo: 75 },
      { id: "severance", provider: "apple-tv", season: 2, episode: 5, fraction: 0.82, hoursAgo: 98 },
      { id: "frieren", provider: "crunchyroll", season: 1, episode: 18, fraction: 0.2, hoursAgo: 140 },
    ],
    completed: [
      ["prisoners", 9, 1],
      ["zodiac", 8, 3],
      ["breaking-bad", 10, 40],
      ["dark", 9, 60],
      ["interstellar", 10, 90],
      ["parasite", 9, 120],
      ["the-batman", 7, 150],
      ["arcane", 10, 33],
      ["whiplash", 9, 200],
      ["spirited-away", 10, 260],
      ["mindhunter", 9, 75],
      ["cowboy-bebop", 9, 310],
      ["oppenheimer", 8, 180],
      ["succession", 9, 100],
      ["true-detective", 8, 220],
      ["better-call-saul", 10, 130],
      ["chainsaw-man", 7, 20],
    ],
    planned: ["andor"],
    wishlist: [
      "dune-part-two",
      "shogun",
      "blade-runner-2049",
      "past-lives",
      "vinland-saga",
      "everything-everywhere",
      "gone-girl",
      "the-bear",
      "mad-max-fury-road",
    ],
  },
  {
    user: { id: "u_giulia", username: "giulia", displayName: "Giulia Romano", email: "giulia@cineloop.dev", avatarUrl: null, bio: "Cucine, drammi familiari e serie da 30 minuti." },
    watching: [{ id: "the-bear", provider: "disney-plus", season: 2, episode: 4, fraction: 0.46, hoursAgo: 1 }],
    completed: [
      ["succession", 10, 30], ["past-lives", 9, 12], ["la-la-land", 9, 90], ["parasite", 10, 70],
      ["whiplash", 8, 110], ["arcane", 9, 45], ["severance", 9, 20],
    ],
    planned: [],
    wishlist: ["shogun", "dune-part-two", "everything-everywhere", "gone-girl", "spirited-away"],
  },
  {
    user: { id: "u_luca", username: "luca", displayName: "Luca Ferri", email: "luca@cineloop.dev", avatarUrl: null, bio: "Se c'è un'esplosione, ci sono." },
    watching: [{ id: "the-boys", provider: "prime-video", season: 1, episode: 5, fraction: 0.3, hoursAgo: 3 }],
    completed: [
      ["mad-max-fury-road", 10, 15], ["the-batman", 8, 40], ["dune-part-two", 9, 25], ["oppenheimer", 8, 60],
      ["breaking-bad", 9, 200], ["chainsaw-man", 8, 35], ["blade-runner-2049", 7, 120],
    ],
    planned: [],
    wishlist: ["interstellar", "shogun", "andor", "vinland-saga", "the-last-of-us", "gone-girl"],
  },
  {
    user: { id: "u_sara", username: "sara", displayName: "Sara Conti", email: "sara@cineloop.dev", avatarUrl: null, bio: "Paradossi temporali e misteri da risolvere con un taccuino." },
    watching: [{ id: "dark", provider: "netflix", season: 1, episode: 6, fraction: 0.55, hoursAgo: 5 }],
    completed: [
      ["zodiac", 9, 8], ["prisoners", 9, 30], ["gone-girl", 8, 50], ["severance", 10, 14],
      ["mindhunter", 9, 80], ["true-detective", 9, 100], ["interstellar", 9, 160],
    ],
    planned: [],
    wishlist: ["shogun", "blade-runner-2049", "past-lives", "the-bear", "frieren"],
  },
  {
    user: { id: "u_elena", username: "elena", displayName: "Elena Greco", email: "elena@cineloop.dev", avatarUrl: null, bio: "Studio Ghibli prima di tutto. Poi tutto il resto." },
    watching: [{ id: "frieren", provider: "crunchyroll", season: 1, episode: 22, fraction: 0.7, hoursAgo: 8 }],
    completed: [
      ["spirited-away", 10, 200], ["your-name", 10, 90], ["attack-on-titan", 9, 60], ["one-piece", 9, 20],
      ["demon-slayer", 8, 45], ["cowboy-bebop", 10, 140], ["arcane", 9, 10],
    ],
    planned: [],
    wishlist: ["vinland-saga", "chainsaw-man", "dune-part-two", "everything-everywhere", "jujutsu-kaisen"],
  },
  {
    user: { id: "u_davide", username: "davide", displayName: "Davide Russo", email: "davide@cineloop.dev", avatarUrl: null, bio: "Rivedo Breaking Bad ogni due anni. Non chiedetemi perché." },
    watching: [{ id: "breaking-bad", provider: "netflix", season: 3, episode: 7, fraction: 0.4, hoursAgo: 12 }],
    completed: [
      ["better-call-saul", 10, 50], ["the-batman", 7, 70], ["interstellar", 10, 100], ["oppenheimer", 9, 30],
      ["succession", 8, 90], ["mad-max-fury-road", 8, 120],
    ],
    planned: [],
    wishlist: ["dune-part-two", "andor", "shogun", "the-last-of-us", "blade-runner-2049"],
  },
];

/** Marco's friends. Friendship is symmetric. */
const FRIENDSHIPS: [string, string, number][] = [
  ["u_marco", "u_giulia", 400],
  ["u_marco", "u_luca", 380],
  ["u_marco", "u_sara", 200],
  ["u_marco", "u_elena", 120],
  ["u_marco", "u_davide", 60],
  ["u_giulia", "u_sara", 300],
  ["u_luca", "u_davide", 500],
];

export interface SeedSnapshot {
  users: User[];
  /** Password hashes are produced by the auth module, not stored here. */
  friendships: { a: string; b: string; since: string }[];
  library: LibraryEntry[];
  wishlist: WishlistItem[];
  watchEvents: WatchEvent[];
  activity: ActivityEvent[];
  notifications: Map<string, AppNotification[]>;
  preferences: UserPreferences[];
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function runtimeOf(titleId: string): number {
  const t = SEED_TITLE_MAP.get(titleId);
  if (!t) return 45;
  return t.type === "movie" ? t.runtimeMinutes : t.episodeRuntimeMinutes;
}

export function buildSeed(now: Date = new Date()): SeedSnapshot {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo).toISOString();
  const users: User[] = [];
  const library: LibraryEntry[] = [];
  const wishlist: WishlistItem[] = [];
  const watchEvents: WatchEvent[] = [];
  const activity: ActivityEvent[] = [];
  let activityId = 0;

  for (const person of PEOPLE) {
    const userId = person.user.id;
    users.push({ ...person.user, createdAt: at(420 * DAY) });

    for (const w of person.watching) {
      const watchedAt = at(w.hoursAgo * HOUR);
      library.push({
        userId,
        titleId: w.id,
        status: "watching",
        addedAt: at((w.hoursAgo + 24 * 30) * HOUR),
        lastWatchedAt: watchedAt,
        rating: null,
        progress: {
          titleId: w.id,
          providerId: w.provider,
          season: w.season ?? null,
          episode: w.episode ?? null,
          fraction: w.fraction,
          url: null,
          updatedAt: watchedAt,
        },
      });
      // The two episodes before the current one count as this week's viewing.
      for (let back = 2; back >= 0; back--) {
        const ep = (w.episode ?? 1) - back;
        if (ep < 1) continue;
        watchEvents.push({
          userId,
          titleId: w.id,
          watchedAt: at((w.hoursAgo + back * 20) * HOUR),
          minutes: back === 0 ? Math.round(runtimeOf(w.id) * w.fraction) : runtimeOf(w.id),
          season: w.season ?? null,
          episode: ep,
        });
      }
      activity.push({
        id: `a${++activityId}`,
        userId,
        kind: "watching",
        titleId: w.id,
        at: watchedAt,
        season: w.season ?? null,
        episode: w.episode ?? null,
        rating: null,
      });
    }

    for (const [titleId, rating, daysAgo] of person.completed) {
      const doneAt = at(daysAgo * DAY + 3 * HOUR);
      library.push({
        userId,
        titleId,
        status: "completed",
        addedAt: at((daysAgo + 20) * DAY),
        lastWatchedAt: doneAt,
        rating,
        progress: null,
      });
      watchEvents.push({ userId, titleId, watchedAt: doneAt, minutes: runtimeOf(titleId), season: null, episode: null });
      activity.push({
        id: `a${++activityId}`,
        userId,
        kind: daysAgo < 20 ? "rated" : "completed",
        titleId,
        at: doneAt,
        season: null,
        episode: null,
        rating,
      });
    }

    for (const titleId of person.planned) {
      library.push({
        userId,
        titleId,
        status: "planned",
        addedAt: at(10 * DAY),
        lastWatchedAt: null,
        rating: null,
        progress: null,
      });
    }

    person.wishlist.forEach((titleId, position) => {
      const addedAt = at((position * 3 + 1) * DAY + position * HOUR);
      wishlist.push({ userId, titleId, addedAt, position, suggestedBy: null });
      if (position < 2) {
        activity.push({
          id: `a${++activityId}`,
          userId,
          kind: "wishlisted",
          titleId,
          at: at(position * 7 * HOUR + 4 * HOUR),
          season: null,
          episode: null,
          rating: null,
        });
      }
    });
  }

  // Two of Marco's wishlist entries were suggested by friends.
  for (const w of wishlist) {
    if (w.userId === "u_marco" && w.titleId === "past-lives") w.suggestedBy = "u_giulia";
    if (w.userId === "u_marco" && w.titleId === "shogun") w.suggestedBy = "u_luca";
  }

  const friendships = FRIENDSHIPS.map(([a, b, days]) => ({ a, b, since: at(days * DAY) }));

  const notifications = new Map<string, AppNotification[]>();
  notifications.set("u_marco", [
    { id: "n1", kind: "watch-party", message: "Giulia ti ha invitato a una serata venerdì.", href: "/watch-party", at: at(40 * 60_000), read: false },
    { id: "n2", kind: "suggestion", message: "Luca ti ha consigliato Shōgun.", href: "/wishlist", at: at(5 * HOUR), read: false },
    { id: "n3", kind: "friend-activity", message: "Sara ha dato 5 stelle a Scissione.", href: "/friends/sara", at: at(14 * DAY), read: true },
  ]);

  const preferences: UserPreferences[] = users.map((u) => ({
    userId: u.id,
    profileVisibility: "friends",
    shareActivity: true,
    notifyFriendActivity: true,
    notifyWatchParty: true,
    notifySuggestions: true,
    reduceMotion: false,
    spoilerShield: true,
    connectedProviders: [],
  }));

  return { users, friendships, library, wishlist, watchEvents, activity, notifications, preferences };
}
