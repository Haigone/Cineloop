import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, primaryKey, real, smallint, text, timestamp } from "drizzle-orm/pg-core";
import type { ActivityKind, Genre, NotificationKind, PartyState, ProviderId, SeasonSummary, WatchPartyFilter, WatchProgress, WatchStatus } from "@/domain/types";

/**
 * PostgreSQL schema. Mirrors the domain model; enum-like columns are text
 * with TypeScript unions so adding a provider or genre needs no migration.
 */

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/** Local cache of catalog titles (seed data or a CatalogService such as TMDB). */
export const titles = pgTable(
  "titles",
  {
    id: text("id").primaryKey(),
    type: text("type").$type<"movie" | "series" | "anime">().notNull(),
    title: text("title").notNull(),
    /** Lower-case, accent-free title for search. */
    searchKey: text("search_key").notNull(),
    year: integer("year").notNull(),
    genres: text("genres").array().$type<Genre[]>().notNull(),
    overview: text("overview").notNull(),
    communityRating: real("community_rating"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    palette: text("palette").array().$type<[string, string, string]>().notNull(),
    providers: text("providers").array().$type<ProviderId[]>().notNull(),
    runtimeMinutes: integer("runtime_minutes"),
    episodeRuntimeMinutes: integer("episode_runtime_minutes"),
    seasons: jsonb("seasons").$type<SeasonSummary[]>(),
  },
  (t) => [index("titles_search_key_idx").on(t.searchKey)],
);

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  createdAt: ts("created_at").notNull().defaultNow(),
});

/** Only the SHA-256 of the session token is stored. */
export const sessions = pgTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const libraryEntries = pgTable(
  "library_entries",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    status: text("status").$type<WatchStatus>().notNull(),
    addedAt: ts("added_at").notNull(),
    lastWatchedAt: ts("last_watched_at"),
    rating: smallint("rating"),
    progress: jsonb("progress").$type<WatchProgress>(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] }), check("rating_range", sql`${t.rating} is null or ${t.rating} between 1 and 10`)],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    addedAt: ts("added_at").notNull(),
    position: integer("position").notNull(),
    suggestedBy: text("suggested_by").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.titleId] }), index("wishlist_user_position_idx").on(t.userId, t.position)],
);

/** One row per friendship, stored with user_a < user_b so a pair exists once. */
export const friendships = pgTable(
  "friendships",
  {
    userA: text("user_a")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    userB: text("user_b")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    since: ts("since").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userA, t.userB] }), check("ordered_pair", sql`${t.userA} < ${t.userB}`), index("friendships_b_idx").on(t.userB)],
);

export const watchEvents = pgTable(
  "watch_events",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    watchedAt: ts("watched_at").notNull(),
    minutes: integer("minutes").notNull(),
    season: integer("season"),
    episode: integer("episode"),
    providerId: text("provider_id").$type<ProviderId>(),
  },
  (t) => [index("watch_events_user_time_idx").on(t.userId, t.watchedAt), index("watch_events_time_idx").on(t.watchedAt)],
);

export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<ActivityKind>().notNull(),
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    at: ts("at").notNull(),
    season: integer("season"),
    episode: integer("episode"),
    rating: smallint("rating"),
  },
  (t) => [index("activity_user_time_idx").on(t.userId, t.at)],
);

export const watchParties = pgTable(
  "watch_parties",
  {
    id: text("id").primaryKey(),
    hostId: text("host_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    participantIds: text("participant_ids").array().notNull(),
    filter: text("filter").$type<WatchPartyFilter>().notNull(),
    genre: text("genre").$type<Genre>(),
    candidateTitleIds: text("candidate_title_ids").array().notNull(),
    pickedTitleId: text("picked_title_id").references(() => titles.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("watch_parties_host_idx").on(t.hostId, t.createdAt)],
);

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").$type<NotificationKind>().notNull(),
    message: text("message").notNull(),
    href: text("href"),
    at: ts("at").notNull(),
    read: boolean("read").notNull().default(false),
  },
  (t) => [index("notifications_user_time_idx").on(t.userId, t.at)],
);

export const preferences = pgTable("preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  profileVisibility: text("profile_visibility").$type<"public" | "friends" | "private">().notNull().default("friends"),
  shareActivity: boolean("share_activity").notNull().default(true),
  liveVisible: boolean("live_visible").notNull().default(true),
  podium: text("podium").array().notNull().default(sql`'{}'::text[]`),
  notifyFriendActivity: boolean("notify_friend_activity").notNull().default(true),
  notifyWatchParty: boolean("notify_watch_party").notNull().default(true),
  notifySuggestions: boolean("notify_suggestions").notNull().default(true),
  reduceMotion: boolean("reduce_motion").notNull().default(false),
  subscriptions: text("subscriptions").array().$type<ProviderId[]>().notNull().default(sql`'{}'::text[]`),
});

/** One-time codes that pair the browser extension with an account. Stored hashed. */
export const pairingCodes = pgTable("pairing_codes", {
  codeHash: text("code_hash").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: ts("expires_at").notNull(),
});

/** Paired extensions. Only the SHA-256 of each device token is stored. */
export const extensionDevices = pgTable(
  "extension_devices",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastUsedAt: ts("last_used_at"),
  },
  (t) => [index("extension_devices_user_idx").on(t.userId)],
);

/** What each user is watching right now, kept alive by extension heartbeats. */
export const presence = pgTable("presence", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  providerId: text("provider_id").$type<ProviderId>().notNull(),
  externalId: text("external_id").notNull(),
  titleId: text("title_id").references(() => titles.id, { onDelete: "set null" }),
  label: text("label"),
  season: integer("season"),
  episode: integer("episode"),
  url: text("url").notNull(),
  partyUrl: text("party_url"),
  guestIds: text("guest_ids").array().notNull().default(sql`'{}'::text[]`),
  startedAt: ts("started_at").notNull(),
  updatedAt: ts("updated_at").notNull(),
  pendingMinutes: real("pending_minutes").notNull().default(0),
});

/** Watch-together rooms, one per host, while their session lasts. */
export const parties = pgTable("parties", {
  hostId: text("host_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  state: jsonb("state").$type<PartyState>().notNull(),
  updatedAt: ts("updated_at").notNull(),
});

/** Provider ids (e.g. a Netflix /watch id) matched to catalog titles, learned from users' confirmations. */
export const providerTitleLinks = pgTable(
  "provider_title_links",
  {
    providerId: text("provider_id").$type<ProviderId>().notNull(),
    externalId: text("external_id").notNull(),
    titleId: text("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.providerId, t.externalId] })],
);

/** Charts fetched from outside (e.g. Netflix's public Top 10), refreshed at most daily. */
export const charts = pgTable("charts", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<unknown>().notNull(),
  fetchedAt: ts("fetched_at").notNull(),
});
