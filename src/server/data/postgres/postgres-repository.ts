import { and, asc, desc, eq, gte, ilike, inArray, ne, or, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type {
  ActivityEvent,
  AnimeWatchPathEntry,
  AppNotification,
  ChartEntry,
  ExtensionDevice,
  Friend,
  LibraryEntry,
  PartyState,
  Presence,
  ProviderId,
  PublicUser,
  RatingValue,
  Title,
  User,
  UserPreferences,
  WatchEvent,
  WatchParty,
  WatchProgress,
  WatchStatus,
  WishlistItem,
} from "@/domain/types";
import { searchKey } from "@/lib/text";
import type { Repository } from "../repository";
import * as schema from "./schema";

type Db = PostgresJsDatabase<typeof schema>;

const iso = (d: Date) => d.toISOString();
const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);

export function createDb(url: string): Db {
  // A small pool is plenty for a personal app; serverless hosts should point at a pooler.
  const client = postgres(url, { max: 10, prepare: false });
  return drizzle(client, { schema });
}

/** PostgreSQL repository on Drizzle. Same contract and semantics as MemoryRepository. */
export class PostgresRepository implements Repository {
  readonly kind = "postgres" as const;
  constructor(private db: Db) {}

  // Catalog -----------------------------------------------------------------

  async listTitles() {
    return (await this.db.select().from(schema.titles).orderBy(asc(schema.titles.title))).map(toTitle);
  }

  async getTitlesByIds(ids: readonly string[]) {
    if (ids.length === 0) return [];
    const rows = await this.db.select().from(schema.titles).where(inArray(schema.titles.id, [...ids]));
    const byId = new Map(rows.map((r) => [r.id, toTitle(r)]));
    return ids.map((id) => byId.get(id)).filter((t): t is Title => Boolean(t));
  }

  async searchTitles(query: string, limit: number) {
    const q = searchKey(query);
    if (!q) return [];
    const rows = await this.db
      .select()
      .from(schema.titles)
      .where(sql`strpos(${schema.titles.searchKey}, ${q}) > 0`)
      .orderBy(sql`strpos(${schema.titles.searchKey}, ${q})`, asc(schema.titles.title))
      .limit(limit);
    return rows.map(toTitle);
  }

  async upsertTitles(list: readonly Title[]) {
    for (const t of list) {
      const row = titleToRow(t);
      await this.db.insert(schema.titles).values(row).onConflictDoUpdate({ target: schema.titles.id, set: row });
    }
  }

  async listAnimeWatchPath(userId: string, rootId: string): Promise<AnimeWatchPathEntry[]> {
    const rows = await this.db.select().from(schema.animeWatchPath).where(
      and(eq(schema.animeWatchPath.userId, userId), eq(schema.animeWatchPath.rootId, rootId)),
    );
    return rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  }

  async upsertAnimeWatchPath(entry: AnimeWatchPathEntry): Promise<void> {
    await this.db.insert(schema.animeWatchPath).values({
      ...entry,
      watchedEpisodes: entry.watchedEpisodes ?? [],
      updatedAt: new Date(entry.updatedAt),
    }).onConflictDoUpdate({
      target: [schema.animeWatchPath.userId, schema.animeWatchPath.rootId, schema.animeWatchPath.animeId],
      set: {
        included: entry.included,
        role: entry.role,
        watched: entry.watched,
        updatedAt: new Date(entry.updatedAt),
      },
    });
  }

  async setAnimeWatchPathWatched(userId: string, animeId: string, watched: boolean): Promise<void> {
    await this.db.update(schema.animeWatchPath)
      .set({ watched, updatedAt: new Date() })
      .where(and(
        eq(schema.animeWatchPath.userId, userId),
        eq(schema.animeWatchPath.animeId, animeId),
        eq(schema.animeWatchPath.included, true),
      ));
  }

  // Users -------------------------------------------------------------------

  async listUsers() {
    return (await this.db.select().from(schema.users)).map(toUser);
  }

  async getUserById(id: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.id, id));
    return row ? toUser(row) : null;
  }

  async getUserByUsername(username: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.username, username.toLowerCase()));
    return row ? toUser(row) : null;
  }

  async getCredentialsByEmail(email: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
    return row ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  async getPasswordHash(userId: string) {
    const [row] = await this.db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId));
    return row?.hash ?? null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));
  }

  async createUser(input: { username: string; displayName: string; email: string; passwordHash: string }) {
    const id = `u_${crypto.randomUUID()}`;
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.users)
        .values({ id, username: input.username.toLowerCase(), displayName: input.displayName, email: input.email.toLowerCase(), passwordHash: input.passwordHash })
        .returning();
      await tx.insert(schema.preferences).values({ userId: id });
      return inserted;
    });
    return toUser(row!);
  }

  async searchUsers(query: string, limit: number) {
    const q = query.trim();
    if (!q) return [];
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const rows = await this.db
      .select()
      .from(schema.users)
      .where(or(ilike(schema.users.displayName, pattern), ilike(schema.users.username, pattern)))
      .limit(limit);
    return rows.map((r) => toPublic(toUser(r)));
  }

  // Sessions ----------------------------------------------------------------

  async createSession(input: { tokenHash: string; userId: string; expiresAt: Date }) {
    await this.db.insert(schema.sessions).values(input);
  }

  async getSession(tokenHash: string) {
    const [row] = await this.db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
    return row ? { userId: row.userId, expiresAt: row.expiresAt } : null;
  }

  async deleteSession(tokenHash: string) {
    await this.db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, tokenHash));
  }

  async deleteUserSessions(userId: string, exceptTokenHash?: string) {
    await this.db
      .delete(schema.sessions)
      .where(and(eq(schema.sessions.userId, userId), exceptTokenHash ? ne(schema.sessions.tokenHash, exceptTokenHash) : undefined));
  }

  // Library -----------------------------------------------------------------

  async listLibrary(userId: string) {
    const rows = await this.db.select().from(schema.libraryEntries).where(eq(schema.libraryEntries.userId, userId));
    return rows.map(toEntry);
  }

  async setLibraryStatus(userId: string, titleId: string, status: WatchStatus) {
    await this.db
      .insert(schema.libraryEntries)
      .values({ userId, titleId, status, addedAt: new Date() })
      .onConflictDoUpdate({
        target: [schema.libraryEntries.userId, schema.libraryEntries.titleId],
        set: status === "completed" ? { status, progress: null } : { status },
      });
  }

  async markSeenThrough(userId: string, titleId: string, season: number) {
    const now = new Date();
    const set = { status: "completed" as const, progress: null, seenThrough: season, lastWatchedAt: now };
    await this.db
      .insert(schema.libraryEntries)
      .values({ userId, titleId, addedAt: now, ...set })
      .onConflictDoUpdate({ target: [schema.libraryEntries.userId, schema.libraryEntries.titleId], set });
  }

  async markFinished(userId: string, titleId: string, seenThrough: number | null) {
    const now = new Date();
    const set = { status: "completed" as const, progress: null, seenThrough, lastWatchedAt: now };
    await this.db
      .insert(schema.libraryEntries)
      .values({ userId, titleId, addedAt: now, askRating: true, ...set })
      .onConflictDoUpdate({
        target: [schema.libraryEntries.userId, schema.libraryEntries.titleId],
        // Already rated (a rewatch): no need to ask again.
        set: { ...set, askRating: sql`${schema.libraryEntries.rating} is null` },
      });
  }

  async removeFromLibrary(userId: string, titleId: string) {
    await this.db.delete(schema.libraryEntries).where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.titleId, titleId)));
  }

  async dismissRatingPrompt(userId: string, titleId: string) {
    await this.db
      .update(schema.libraryEntries)
      .set({ askRating: false })
      .where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.titleId, titleId)));
  }

  async setRating(userId: string, titleId: string, value: RatingValue | null) {
    if (value === null) {
      await this.db
        .update(schema.libraryEntries)
        .set({ rating: null })
        .where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.titleId, titleId)));
      return;
    }
    const now = new Date();
    await this.db
      .insert(schema.libraryEntries)
      .values({ userId, titleId, status: "completed", addedAt: now, lastWatchedAt: now, rating: value })
      .onConflictDoUpdate({ target: [schema.libraryEntries.userId, schema.libraryEntries.titleId], set: { rating: value, askRating: false } });
  }

  async saveProgress(userId: string, progress: WatchProgress) {
    const at = new Date(progress.updatedAt);
    await this.db
      .insert(schema.libraryEntries)
      .values({ userId, titleId: progress.titleId, status: "watching", addedAt: at, lastWatchedAt: at, progress })
      .onConflictDoUpdate({
        target: [schema.libraryEntries.userId, schema.libraryEntries.titleId],
        set: { status: "watching", lastWatchedAt: at, progress },
      });
  }

  async addWatchEvent(e: WatchEvent) {
    await this.db.insert(schema.watchEvents).values({
      userId: e.userId,
      titleId: e.titleId,
      watchedAt: new Date(e.watchedAt),
      minutes: e.minutes,
      season: e.season,
      episode: e.episode,
      providerId: e.providerId ?? null,
    });
  }

  async topWatched({ since, providerId, limit }: { since: Date; providerId?: ProviderId; limit: number }) {
    const w = schema.watchEvents;
    const viewers = sql<number>`count(distinct ${w.userId})::int`;
    const minutes = sql<number>`sum(${w.minutes})::int`;
    const rows = await this.db
      .select({ titleId: w.titleId, viewers, minutes })
      .from(w)
      // No preferences row yet means the defaults, which share activity.
      .leftJoin(schema.preferences, eq(schema.preferences.userId, w.userId))
      .where(and(gte(w.watchedAt, since), sql`coalesce(${schema.preferences.shareActivity}, true)`, providerId ? eq(w.providerId, providerId) : undefined))
      .groupBy(w.titleId)
      .orderBy(desc(viewers), desc(minutes))
      .limit(limit);
    return rows as ChartEntry[];
  }

  async getParty(hostId: string) {
    const [row] = await this.db.select().from(schema.parties).where(eq(schema.parties.hostId, hostId));
    return row ? row.state : null;
  }

  async saveParty(hostId: string, party: PartyState | null) {
    if (!party) {
      await this.db.delete(schema.parties).where(eq(schema.parties.hostId, hostId));
      return;
    }
    const row = { hostId, state: party, updatedAt: new Date() };
    await this.db.insert(schema.parties).values(row).onConflictDoUpdate({ target: schema.parties.hostId, set: row });
  }

  async getChart(id: string) {
    const [row] = await this.db.select().from(schema.charts).where(eq(schema.charts.id, id));
    return row ? { data: row.data, fetchedAt: row.fetchedAt } : null;
  }

  async saveChart(id: string, data: unknown) {
    const row = { id, data, fetchedAt: new Date() };
    await this.db.insert(schema.charts).values(row).onConflictDoUpdate({ target: schema.charts.id, set: row });
  }

  async listWatchEvents(userId: string, since: Date) {
    const rows = await this.db
      .select()
      .from(schema.watchEvents)
      .where(and(eq(schema.watchEvents.userId, userId), gte(schema.watchEvents.watchedAt, since)));
    return rows.map(
      (r): WatchEvent => ({
        userId: r.userId,
        titleId: r.titleId,
        watchedAt: iso(r.watchedAt),
        minutes: r.minutes,
        season: r.season,
        episode: r.episode,
        providerId: r.providerId,
      }),
    );
  }

  // Wishlist ----------------------------------------------------------------

  async listWishlist(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.wishlistItems)
      .where(eq(schema.wishlistItems.userId, userId))
      .orderBy(asc(schema.wishlistItems.position));
    return rows.map(
      (r): WishlistItem => ({ userId: r.userId, titleId: r.titleId, addedAt: iso(r.addedAt), position: r.position, suggestedBy: r.suggestedBy }),
    );
  }

  async addToWishlist(userId: string, titleId: string, suggestedBy: string | null = null) {
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select({ id: schema.wishlistItems.titleId })
        .from(schema.wishlistItems)
        .where(and(eq(schema.wishlistItems.userId, userId), eq(schema.wishlistItems.titleId, titleId)));
      if (existing) return;
      // New items go to the top, like a queue you just added to.
      await tx
        .update(schema.wishlistItems)
        .set({ position: sql`${schema.wishlistItems.position} + 1` })
        .where(eq(schema.wishlistItems.userId, userId));
      await tx.insert(schema.wishlistItems).values({ userId, titleId, addedAt: new Date(), position: 0, suggestedBy });
    });
  }

  async removeFromWishlist(userId: string, titleId: string) {
    await this.db.transaction(async (tx) => {
      await tx.delete(schema.wishlistItems).where(and(eq(schema.wishlistItems.userId, userId), eq(schema.wishlistItems.titleId, titleId)));
      // Close the gap so positions stay 0..n-1.
      await tx.execute(sql`
        update wishlist_items w set position = r.rn - 1
        from (select title_id, row_number() over (order by position) as rn from wishlist_items where user_id = ${userId}) r
        where w.user_id = ${userId} and w.title_id = r.title_id`);
    });
  }

  async reorderWishlist(userId: string, orderedTitleIds: readonly string[]) {
    if (orderedTitleIds.length === 0) return;
    await this.db.transaction(async (tx) => {
      for (const [i, titleId] of orderedTitleIds.entries()) {
        await tx
          .update(schema.wishlistItems)
          .set({ position: i })
          .where(and(eq(schema.wishlistItems.userId, userId), eq(schema.wishlistItems.titleId, titleId)));
      }
    });
  }

  // Social ------------------------------------------------------------------

  async listFriends(userId: string) {
    const rows = await this.db
      .select({ user: schema.users, since: schema.friendships.since })
      .from(schema.friendships)
      .innerJoin(
        schema.users,
        sql`${schema.users.id} = case when ${schema.friendships.userA} = ${userId} then ${schema.friendships.userB} else ${schema.friendships.userA} end`,
      )
      .where(or(eq(schema.friendships.userA, userId), eq(schema.friendships.userB, userId)));
    return rows.map((r): Friend => ({ user: toPublic(toUser(r.user)), since: iso(r.since) }));
  }

  async addFriend(userId: string, friendId: string) {
    if (userId === friendId) return;
    const [userA, userB] = [userId, friendId].sort() as [string, string];
    await this.db.insert(schema.friendships).values({ userA, userB }).onConflictDoNothing();
  }

  async removeFriend(userId: string, friendId: string) {
    const [userA, userB] = [userId, friendId].sort() as [string, string];
    await this.db.delete(schema.friendships).where(and(eq(schema.friendships.userA, userA), eq(schema.friendships.userB, userB)));
  }

  async listActivity(userIds: readonly string[], limit: number) {
    if (userIds.length === 0) return [];
    const rows = await this.db
      .select()
      .from(schema.activity)
      .where(inArray(schema.activity.userId, [...userIds]))
      .orderBy(desc(schema.activity.at))
      .limit(limit);
    return rows.map(
      (r): ActivityEvent => ({
        id: r.id,
        userId: r.userId,
        kind: r.kind,
        titleId: r.titleId,
        at: iso(r.at),
        season: r.season,
        episode: r.episode,
        rating: r.rating as RatingValue | null,
      }),
    );
  }

  // Watch parties -----------------------------------------------------------

  async createWatchParty(input: Omit<WatchParty, "id" | "createdAt">) {
    const [row] = await this.db
      .insert(schema.watchParties)
      .values({ ...input, id: `wp_${crypto.randomUUID()}` })
      .returning();
    return toParty(row!);
  }

  async setWatchPartyPick(partyId: string, hostId: string, titleId: string) {
    await this.db
      .update(schema.watchParties)
      .set({ pickedTitleId: titleId })
      .where(and(eq(schema.watchParties.id, partyId), eq(schema.watchParties.hostId, hostId)));
  }

  async listWatchParties(userId: string, limit: number) {
    const rows = await this.db
      .select()
      .from(schema.watchParties)
      .where(or(eq(schema.watchParties.hostId, userId), sql`${userId} = any(${schema.watchParties.participantIds})`))
      .orderBy(desc(schema.watchParties.createdAt))
      .limit(limit);
    return rows.map(toParty);
  }

  async recordActivity(e: Omit<ActivityEvent, "id">) {
    await this.db.insert(schema.activity).values({
      id: `a_${crypto.randomUUID()}`,
      userId: e.userId,
      kind: e.kind,
      titleId: e.titleId,
      at: new Date(e.at),
      season: e.season,
      episode: e.episode,
      rating: e.rating,
    });
  }

  // Browser extension -------------------------------------------------------

  async createPairingCode(input: { codeHash: string; userId: string; expiresAt: Date }) {
    // Housekeeping: expired codes are useless, drop them as new ones are made.
    await this.db.delete(schema.pairingCodes).where(sql`${schema.pairingCodes.expiresAt} < now()`);
    await this.db.insert(schema.pairingCodes).values(input);
  }

  async consumePairingCode(codeHash: string) {
    const [row] = await this.db.delete(schema.pairingCodes).where(eq(schema.pairingCodes.codeHash, codeHash)).returning();
    return row && row.expiresAt.getTime() > Date.now() ? row.userId : null;
  }

  async createExtensionDevice(input: { id: string; userId: string; tokenHash: string; label: string }) {
    await this.db.insert(schema.extensionDevices).values(input);
  }

  async useExtensionToken(tokenHash: string) {
    const [row] = await this.db
      .update(schema.extensionDevices)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.extensionDevices.tokenHash, tokenHash))
      .returning({ deviceId: schema.extensionDevices.id, userId: schema.extensionDevices.userId });
    return row ?? null;
  }

  async listExtensionDevices(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.extensionDevices)
      .where(eq(schema.extensionDevices.userId, userId))
      .orderBy(desc(schema.extensionDevices.createdAt));
    return rows.map((r): ExtensionDevice => ({ id: r.id, label: r.label, createdAt: iso(r.createdAt), lastUsedAt: isoOrNull(r.lastUsedAt) }));
  }

  async deleteExtensionDevice(userId: string, deviceId: string) {
    await this.db
      .delete(schema.extensionDevices)
      .where(and(eq(schema.extensionDevices.userId, userId), eq(schema.extensionDevices.id, deviceId)));
  }

  async getPresence(userId: string) {
    const [row] = await this.db.select().from(schema.presence).where(eq(schema.presence.userId, userId));
    return row ? toPresence(row) : null;
  }

  async listPresence(userIds: readonly string[]) {
    if (userIds.length === 0) return [];
    const rows = await this.db.select().from(schema.presence).where(inArray(schema.presence.userId, [...userIds]));
    return rows.map(toPresence);
  }

  async savePresence(p: Presence) {
    const row = { ...p, startedAt: new Date(p.startedAt), updatedAt: new Date(p.updatedAt) };
    await this.db.insert(schema.presence).values(row).onConflictDoUpdate({ target: schema.presence.userId, set: row });
  }

  async clearPresence(userId: string) {
    await this.db.delete(schema.presence).where(eq(schema.presence.userId, userId));
  }

  async findProviderLink(providerId: ProviderId, externalIds: readonly string[]) {
    if (externalIds.length === 0) return null;
    const rows = await this.db
      .select()
      .from(schema.providerTitleLinks)
      .where(and(eq(schema.providerTitleLinks.providerId, providerId), inArray(schema.providerTitleLinks.externalId, [...externalIds])));
    for (const id of externalIds) {
      const hit = rows.find((r) => r.externalId === id);
      if (hit) return hit.titleId;
    }
    return null;
  }

  async saveProviderLink(input: { providerId: ProviderId; externalId: string; titleId: string; userId: string }) {
    await this.db
      .insert(schema.providerTitleLinks)
      .values({ providerId: input.providerId, externalId: input.externalId, titleId: input.titleId, createdBy: input.userId })
      .onConflictDoUpdate({
        target: [schema.providerTitleLinks.providerId, schema.providerTitleLinks.externalId],
        set: { titleId: input.titleId, createdBy: input.userId, createdAt: new Date() },
      });
  }

  // Notifications & preferences --------------------------------------------

  async listNotifications(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.at))
      .limit(50);
    return rows.map((r): AppNotification => ({ id: r.id, kind: r.kind, message: r.message, href: r.href, at: iso(r.at), read: r.read }));
  }

  async createNotification(input: Omit<AppNotification, "id" | "read"> & { userId: string }) {
    await this.db.insert(schema.notifications).values({
      id: `n_${crypto.randomUUID()}`,
      userId: input.userId,
      kind: input.kind,
      message: input.message,
      href: input.href,
      at: new Date(input.at),
      read: false,
    });
  }

  async markNotificationsRead(userId: string) {
    await this.db.update(schema.notifications).set({ read: true }).where(eq(schema.notifications.userId, userId));
  }

  async getPreferences(userId: string) {
    const [row] = await this.db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId));
    if (row) return row;
    const [created] = await this.db.insert(schema.preferences).values({ userId }).onConflictDoNothing().returning();
    return created ?? (await this.db.select().from(schema.preferences).where(eq(schema.preferences.userId, userId)))[0]!;
  }

  async updatePreferences(userId: string, patch: Partial<Omit<UserPreferences, "userId">>) {
    await this.getPreferences(userId);
    if (Object.keys(patch).length === 0) return this.getPreferences(userId);
    const [row] = await this.db.update(schema.preferences).set(patch).where(eq(schema.preferences.userId, userId)).returning();
    return row!;
  }

  async updateProfile(userId: string, patch: { displayName?: string; bio?: string | null }) {
    const [row] = await this.db.update(schema.users).set(patch).where(eq(schema.users.id, userId)).returning();
    if (!row) throw new Error("User not found");
    return toUser(row);
  }
}

// Row mappers ---------------------------------------------------------------

function toTitle(r: typeof schema.titles.$inferSelect): Title {
  const base = {
    id: r.id,
    title: r.title,
    year: r.year,
    genres: r.genres,
    overview: r.overview,
    communityRating: r.communityRating,
    artwork: { posterUrl: r.posterUrl, backdropUrl: r.backdropUrl, palette: r.palette },
    providers: r.providers,
  };
  return r.type === "movie"
    ? { ...base, type: "movie", runtimeMinutes: r.runtimeMinutes ?? 0, ...(r.partOf === null ? {} : { partOf: r.partOf || null }) }
    : { ...base, type: r.type, seasons: r.seasons ?? [], episodeRuntimeMinutes: r.episodeRuntimeMinutes ?? 0 };
}

export function titleToRow(t: Title): typeof schema.titles.$inferInsert {
  return {
    id: t.id,
    type: t.type,
    title: t.title,
    searchKey: searchKey(t.title),
    year: t.year,
    genres: t.genres,
    overview: t.overview,
    communityRating: t.communityRating,
    posterUrl: t.artwork.posterUrl,
    backdropUrl: t.artwork.backdropUrl,
    palette: [...t.artwork.palette] as [string, string, string],
    providers: t.providers,
    runtimeMinutes: t.type === "movie" ? t.runtimeMinutes : null,
    // "" records "checked: a film of its own"; null means not checked yet.
    partOf: t.type === "movie" ? (t.partOf === undefined ? null : (t.partOf ?? "")) : null,
    episodeRuntimeMinutes: t.type === "movie" ? null : t.episodeRuntimeMinutes,
    seasons: t.type === "movie" ? null : t.seasons,
  };
}

function toUser(r: typeof schema.users.$inferSelect): User {
  return { id: r.id, username: r.username, displayName: r.displayName, email: r.email, avatarUrl: r.avatarUrl, bio: r.bio, createdAt: iso(r.createdAt) };
}

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, bio: u.bio };
}

function toEntry(r: typeof schema.libraryEntries.$inferSelect): LibraryEntry {
  return {
    userId: r.userId,
    titleId: r.titleId,
    status: r.status,
    addedAt: iso(r.addedAt),
    lastWatchedAt: isoOrNull(r.lastWatchedAt),
    rating: r.rating as RatingValue | null,
    progress: r.progress,
    seenThrough: r.seenThrough,
    askRating: r.askRating,
  };
}

function toParty(r: typeof schema.watchParties.$inferSelect): WatchParty {
  return {
    id: r.id,
    hostId: r.hostId,
    participantIds: r.participantIds,
    filter: r.filter,
    genre: r.genre,
    candidateTitleIds: r.candidateTitleIds,
    pickedTitleId: r.pickedTitleId,
    createdAt: iso(r.createdAt),
  };
}

function toPresence(r: typeof schema.presence.$inferSelect): Presence {
  return { ...r, startedAt: iso(r.startedAt), updatedAt: iso(r.updatedAt) };
}
