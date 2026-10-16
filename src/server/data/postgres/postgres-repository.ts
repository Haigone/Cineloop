import { and, asc, count, desc, eq, gte, ilike, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type {
  ActivityEvent,
  AppNotification,
  CollectionChoice,
  ChartEntry,
  ExtensionDevice,
  Friend,
  LibraryEntry,
  OAuthProvider,
  PartyState,
  Playlist,
  PlaylistVisibility,
  Presence,
  ProviderId,
  PublicUser,
  RatingValue,
  TitleUpdates,
  SharedWatch,
  Title,
  User,
  UserPreferences,
  WatchEvent,
  WatchParty,
  WatchPartyStatus,
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
    return row?.passwordHash ? { user: toUser(row), passwordHash: row.passwordHash } : null;
  }

  async getPasswordHash(userId: string) {
    const [row] = await this.db.select({ hash: schema.users.passwordHash }).from(schema.users).where(eq(schema.users.id, userId));
    return row?.hash ?? null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    await this.db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, userId));
  }

  async createUser(input: { username: string; displayName: string; email: string | null; passwordHash: string | null }) {
    const id = `u_${crypto.randomUUID()}`;
    const [row] = await this.db.transaction(async (tx) => {
      const inserted = await tx
        .insert(schema.users)
        .values({ id, username: input.username.toLowerCase(), displayName: input.displayName, email: input.email?.toLowerCase() ?? null, passwordHash: input.passwordHash })
        .returning();
      await tx.insert(schema.preferences).values({ userId: id });
      return inserted;
    });
    return toUser(row!);
  }

  async completeRegistration(userId: string, input: { displayName: string; email: string; passwordHash: string }) {
    const [row] = await this.db
      .update(schema.users)
      .set({ displayName: input.displayName, email: input.email.toLowerCase(), passwordHash: input.passwordHash })
      .where(eq(schema.users.id, userId))
      .returning();
    if (!row) throw new Error("User not found");
    return toUser(row);
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

  async getUserByEmail(email: string) {
    const [row] = await this.db.select().from(schema.users).where(eq(schema.users.email, email.toLowerCase()));
    return row ? toUser(row) : null;
  }

  async setUserEmail(userId: string, email: string) {
    const [row] = await this.db.update(schema.users).set({ email: email.toLowerCase() }).where(eq(schema.users.id, userId)).returning();
    if (!row) throw new Error("User not found");
    return toUser(row);
  }

  async getUserByOAuth(provider: OAuthProvider, providerUserId: string) {
    const [row] = await this.db
      .select({ user: schema.users })
      .from(schema.oauthAccounts)
      .innerJoin(schema.users, eq(schema.users.id, schema.oauthAccounts.userId))
      .where(and(eq(schema.oauthAccounts.provider, provider), eq(schema.oauthAccounts.providerUserId, providerUserId)));
    return row ? toUser(row.user) : null;
  }

  async linkOAuthAccount(userId: string, provider: OAuthProvider, providerUserId: string) {
    await this.db
      .insert(schema.oauthAccounts)
      .values({ provider, providerUserId, userId })
      .onConflictDoUpdate({ target: [schema.oauthAccounts.provider, schema.oauthAccounts.providerUserId], set: { userId } });
  }

  async listOAuthProviders(userId: string) {
    const rows = await this.db.select({ provider: schema.oauthAccounts.provider }).from(schema.oauthAccounts).where(eq(schema.oauthAccounts.userId, userId));
    return rows.map((r) => r.provider);
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

  async replaceTitle(oldId: string, next: Title) {
    return this.db.transaction(async (tx) => {
      const row = titleToRow(next);
      await tx.insert(schema.titles).values(row).onConflictDoUpdate({ target: schema.titles.id, set: row });
      // Where the user already has the new title, theirs stays and the old entry goes.
      const dup = (table: string) =>
        sql`delete from ${sql.raw(table)} o where o.title_id = ${oldId} and exists (select 1 from ${sql.raw(table)} n where n.user_id = o.user_id and n.title_id = ${next.id})`;
      await tx.execute(dup("wishlist_items"));
      const mergedLibrary = await tx.execute(dup("library_entries"));
      const merged = (mergedLibrary as unknown as { count?: number }).count ?? 0;
      const moved = await tx.update(schema.libraryEntries).set({ titleId: next.id }).where(eq(schema.libraryEntries.titleId, oldId)).returning({ u: schema.libraryEntries.userId });
      await tx.update(schema.wishlistItems).set({ titleId: next.id }).where(eq(schema.wishlistItems.titleId, oldId));
      await tx.execute(sql`delete from playlist_items o where o.title_id = ${oldId} and exists (select 1 from playlist_items n where n.playlist_id = o.playlist_id and n.title_id = ${next.id})`);
      await tx.update(schema.playlistItems).set({ titleId: next.id }).where(eq(schema.playlistItems.titleId, oldId));
      await tx.update(schema.watchEvents).set({ titleId: next.id }).where(eq(schema.watchEvents.titleId, oldId));
      await tx.update(schema.activity).set({ titleId: next.id }).where(eq(schema.activity.titleId, oldId));
      await tx.update(schema.providerTitleLinks).set({ titleId: next.id }).where(eq(schema.providerTitleLinks.titleId, oldId));
      await tx.update(schema.presence).set({ titleId: next.id }).where(eq(schema.presence.titleId, oldId));
      await tx.update(schema.watchParties).set({ pickedTitleId: next.id }).where(eq(schema.watchParties.pickedTitleId, oldId));
      await tx.update(schema.sharedWatches).set({ titleId: next.id }).where(eq(schema.sharedWatches.titleId, oldId));
      await tx.execute(sql`update watch_parties set candidate_title_ids = array_replace(candidate_title_ids, ${oldId}, ${next.id}) where ${oldId} = any(candidate_title_ids)`);
      await tx.update(schema.titles).set({ partOf: next.id }).where(eq(schema.titles.partOf, oldId));
      await tx.delete(schema.titles).where(eq(schema.titles.id, oldId));
      return { moved: moved.length, merged };
    });
  }

  async setPartOverride(userId: string, titleId: string, key: string, included: boolean | null) {
    const [row] = await this.db
      .select({ partOverrides: schema.libraryEntries.partOverrides })
      .from(schema.libraryEntries)
      .where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.titleId, titleId)));
    if (!row) return;
    const next = { ...row.partOverrides };
    if (included === null) delete next[key];
    else next[key] = included;
    await this.db
      .update(schema.libraryEntries)
      .set({ partOverrides: next })
      .where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.titleId, titleId)));
  }

  async dismissRatingPrompt(userId: string, titleId: string) {
    await this.db
      .update(schema.libraryEntries)
      .set({ askRating: false })
      .where(and(eq(schema.libraryEntries.userId, userId), eq(schema.libraryEntries.titleId, titleId)));
  }

  async setUpdates(userId: string, titleId: string, updates: TitleUpdates) {
    await this.db
      .update(schema.libraryEntries)
      .set({ updates })
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

  // Playlists -------------------------------------------------------------------

  private async withItems(rows: (typeof schema.playlists.$inferSelect)[]): Promise<Playlist[]> {
    if (rows.length === 0) return [];
    const items = await this.db
      .select()
      .from(schema.playlistItems)
      .where(inArray(schema.playlistItems.playlistId, rows.map((r) => r.id)))
      .orderBy(asc(schema.playlistItems.position));
    return rows.map((r) => ({
      id: r.id,
      ownerId: r.ownerId,
      name: r.name,
      visibility: r.visibility,
      titleIds: items.filter((i) => i.playlistId === r.id).map((i) => i.titleId),
      createdAt: r.createdAt.toISOString(),
      publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    }));
  }

  async listPlaylists(ownerId: string) {
    return this.withItems(await this.db.select().from(schema.playlists).where(eq(schema.playlists.ownerId, ownerId)).orderBy(desc(schema.playlists.createdAt)));
  }

  async getPlaylist(id: string) {
    return (await this.withItems(await this.db.select().from(schema.playlists).where(eq(schema.playlists.id, id))))[0] ?? null;
  }

  async listSharedPlaylists(ownerIds: readonly string[]) {
    if (ownerIds.length === 0) return [];
    return this.withItems(
      await this.db
        .select()
        .from(schema.playlists)
        .where(and(inArray(schema.playlists.ownerId, [...ownerIds]), ne(schema.playlists.visibility, "private"))),
    );
  }

  async createPlaylist(ownerId: string, name: string, visibility: PlaylistVisibility) {
    const [row] = await this.db.insert(schema.playlists).values({ id: `pl_${crypto.randomUUID()}`, ownerId, name, visibility }).returning();
    return { id: row!.id, ownerId, name, visibility, titleIds: [], createdAt: row!.createdAt.toISOString(), publishedAt: null };
  }

  async updatePlaylist(ownerId: string, id: string, patch: { name?: string; visibility?: PlaylistVisibility; published?: boolean }) {
    const { published, ...rest } = patch;
    const rows = await this.db
      .update(schema.playlists)
      // Publishing again keeps the first date, so a re-saved playlist does not jump to the top.
      .set({ ...rest, ...(published === undefined ? {} : { publishedAt: published ? sql`coalesce(${schema.playlists.publishedAt}, now())` : null }) })
      .where(and(eq(schema.playlists.id, id), eq(schema.playlists.ownerId, ownerId)))
      .returning({ id: schema.playlists.id });
    return rows.length > 0;
  }

  async deletePlaylist(ownerId: string, id: string) {
    const rows = await this.db
      .delete(schema.playlists)
      .where(and(eq(schema.playlists.id, id), eq(schema.playlists.ownerId, ownerId)))
      .returning({ id: schema.playlists.id });
    return rows.length > 0;
  }

  async setPlaylistItem(ownerId: string, id: string, titleId: string, present: boolean) {
    const [owned] = await this.db
      .select({ id: schema.playlists.id })
      .from(schema.playlists)
      .where(and(eq(schema.playlists.id, id), eq(schema.playlists.ownerId, ownerId)));
    if (!owned) return false;
    if (present) {
      const [last] = await this.db
        .select({ position: schema.playlistItems.position })
        .from(schema.playlistItems)
        .where(eq(schema.playlistItems.playlistId, id))
        .orderBy(desc(schema.playlistItems.position))
        .limit(1);
      await this.db
        .insert(schema.playlistItems)
        .values({ playlistId: id, titleId, position: (last?.position ?? -1) + 1 })
        .onConflictDoNothing();
    } else {
      await this.db.delete(schema.playlistItems).where(and(eq(schema.playlistItems.playlistId, id), eq(schema.playlistItems.titleId, titleId)));
    }
    return true;
  }

  async listCommunityPlaylists(limit: number) {
    const rows = await this.db
      .select()
      .from(schema.playlists)
      .where(isNotNull(schema.playlists.publishedAt))
      .orderBy(desc(schema.playlists.publishedAt))
      .limit(limit);
    if (rows.length === 0) return [];
    const counts = await this.db
      .select({ playlistId: schema.savedPlaylists.playlistId, saves: count() })
      .from(schema.savedPlaylists)
      .where(inArray(schema.savedPlaylists.playlistId, rows.map((r) => r.id)))
      .groupBy(schema.savedPlaylists.playlistId);
    const saves = new Map(counts.map((c) => [c.playlistId, Number(c.saves)]));
    return (await this.withItems(rows)).map((playlist) => ({ playlist, saves: saves.get(playlist.id) ?? 0 }));
  }

  async listSavedPlaylists(userId: string) {
    const rows = await this.db
      .select({ playlist: schema.playlists })
      .from(schema.savedPlaylists)
      .innerJoin(schema.playlists, eq(schema.playlists.id, schema.savedPlaylists.playlistId))
      .where(and(eq(schema.savedPlaylists.userId, userId), isNotNull(schema.playlists.publishedAt)))
      .orderBy(desc(schema.savedPlaylists.savedAt));
    return this.withItems(rows.map((r) => r.playlist));
  }

  async setPlaylistSaved(userId: string, playlistId: string, saved: boolean) {
    if (saved) await this.db.insert(schema.savedPlaylists).values({ userId, playlistId }).onConflictDoNothing();
    else await this.db.delete(schema.savedPlaylists).where(and(eq(schema.savedPlaylists.userId, userId), eq(schema.savedPlaylists.playlistId, playlistId)));
  }

  // Watch parties -----------------------------------------------------------

  async listSharedWatches(userId: string) {
    const rows = await this.db
      .select()
      .from(schema.sharedWatches)
      .where(sql`${userId} = any(${schema.sharedWatches.memberIds})`)
      .orderBy(desc(schema.sharedWatches.createdAt));
    return rows.map(toSharedWatch);
  }

  async getSharedWatch(id: string) {
    const [row] = await this.db.select().from(schema.sharedWatches).where(eq(schema.sharedWatches.id, id));
    return row ? toSharedWatch(row) : null;
  }

  async createSharedWatch(input: { titleId: string; hostId: string; memberIds: string[] }) {
    const [row] = await this.db
      .insert(schema.sharedWatches)
      .values({ ...input, id: `sw_${crypto.randomUUID()}` })
      .returning();
    return toSharedWatch(row!);
  }

  async updateSharedWatch(id: string, patch: { memberIds?: string[]; hostId?: string; updatedBy?: string; updatedAt?: string }) {
    const { updatedAt, ...rest } = patch;
    await this.db
      .update(schema.sharedWatches)
      .set({ ...rest, ...(updatedAt ? { updatedAt: new Date(updatedAt) } : {}) })
      .where(eq(schema.sharedWatches.id, id));
  }

  async deleteSharedWatch(id: string) {
    await this.db.delete(schema.sharedWatches).where(eq(schema.sharedWatches.id, id));
  }

  async createWatchParty(input: Omit<WatchParty, "id" | "createdAt">) {
    const { scheduledFor, ...rest } = input;
    const [row] = await this.db
      .insert(schema.watchParties)
      .values({ ...rest, scheduledFor: scheduledFor ? new Date(scheduledFor) : null, id: `wp_${crypto.randomUUID()}` })
      .returning();
    return toParty(row!);
  }

  async setWatchPartyPick(partyId: string, hostId: string, titleId: string) {
    await this.db
      .update(schema.watchParties)
      .set({ pickedTitleId: titleId })
      .where(and(eq(schema.watchParties.id, partyId), eq(schema.watchParties.hostId, hostId)));
  }

  async setWatchPartyStatus(partyId: string, status: WatchPartyStatus) {
    await this.db.update(schema.watchParties).set({ status }).where(eq(schema.watchParties.id, partyId));
  }

  async updateWatchParty(partyId: string, patch: { participantIds?: string[]; status?: WatchPartyStatus; scheduledFor?: string | null }) {
    const set: Partial<typeof schema.watchParties.$inferInsert> = {};
    if (patch.participantIds) set.participantIds = patch.participantIds;
    if (patch.status) set.status = patch.status;
    if (patch.scheduledFor !== undefined) set.scheduledFor = patch.scheduledFor ? new Date(patch.scheduledFor) : null;
    if (Object.keys(set).length) await this.db.update(schema.watchParties).set(set).where(eq(schema.watchParties.id, partyId));
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

  async saveObservedEpisodeLink(input: { providerId: ProviderId; titleId: string; seasonNumber: number; episodeNumber: number; externalId: string }) {
    if (!Number.isSafeInteger(input.seasonNumber) || input.seasonNumber < 1 || !Number.isSafeInteger(input.episodeNumber) || input.episodeNumber < 1) return;
    const scope = and(
      eq(schema.episodeLinks.providerId, input.providerId),
      eq(schema.episodeLinks.titleId, input.titleId),
      eq(schema.episodeLinks.seasonNumber, input.seasonNumber),
    );
    const [anchor] = await this.db.select().from(schema.episodeLinks).where(and(scope, eq(schema.episodeLinks.linkType, "anchor"))).limit(1);
    if (!anchor) {
      await this.db.insert(schema.episodeLinks).values({
        providerId: input.providerId, titleId: input.titleId, seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber, externalId: input.externalId, idStep: null, linkType: "anchor",
      }).onConflictDoNothing();
      return;
    }
    if (anchor.episodeNumber === input.episodeNumber) return;
    const anchorId = /^\\d+$/.test(anchor.externalId) ? Number(anchor.externalId) : NaN;
    const observedId = /^\\d+$/.test(input.externalId) ? Number(input.externalId) : NaN;
    if (anchor.idStep === 1 && Number.isSafeInteger(anchorId) && Number.isSafeInteger(observedId)) {
      const expected = anchorId + input.episodeNumber - anchor.episodeNumber;
      if (expected === observedId) return;
      await this.db.insert(schema.episodeLinks).values({
        providerId: input.providerId, titleId: input.titleId, seasonNumber: input.seasonNumber,
        episodeNumber: input.episodeNumber, externalId: input.externalId, idStep: null, linkType: "exact",
      }).onConflictDoUpdate({
        target: [schema.episodeLinks.providerId, schema.episodeLinks.titleId, schema.episodeLinks.seasonNumber, schema.episodeLinks.episodeNumber],
        set: { externalId: input.externalId, idStep: null, linkType: "exact" },
      });
      return;
    }
    if (anchor.idStep === null && Math.abs(input.episodeNumber - anchor.episodeNumber) === 1 &&
      observedId - anchorId === input.episodeNumber - anchor.episodeNumber &&
      Number.isSafeInteger(anchorId) && Number.isSafeInteger(observedId)) {
      await this.db.update(schema.episodeLinks).set({ idStep: 1 }).where(and(scope, eq(schema.episodeLinks.episodeNumber, anchor.episodeNumber), eq(schema.episodeLinks.linkType, "anchor")));
    }
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

  // Sagas -------------------------------------------------------------------

  async listCollectionChoices(userId: string) {
    const rows = await this.db.select().from(schema.collectionChoices).where(eq(schema.collectionChoices.userId, userId));
    return rows.map((r): CollectionChoice => ({ collectionId: r.collectionId, order: r.order, excluded: r.excluded }));
  }

  async saveCollectionChoice(userId: string, choice: CollectionChoice) {
    const key = and(eq(schema.collectionChoices.userId, userId), eq(schema.collectionChoices.collectionId, choice.collectionId));
    if (choice.order.length === 0 && choice.excluded.length === 0) {
      await this.db.delete(schema.collectionChoices).where(key);
      return;
    }
    const row = { userId, collectionId: choice.collectionId, order: [...choice.order], excluded: [...choice.excluded], updatedAt: new Date() };
    await this.db
      .insert(schema.collectionChoices)
      .values(row)
      .onConflictDoUpdate({ target: [schema.collectionChoices.userId, schema.collectionChoices.collectionId], set: { order: row.order, excluded: row.excluded, updatedAt: row.updatedAt } });
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
    ? {
        ...base,
        type: "movie",
        runtimeMinutes: r.runtimeMinutes ?? 0,
        ...(r.partOf === null ? {} : { partOf: r.partOf || null }),
        ...(r.collectionId === null ? {} : { collection: r.collectionId ? { id: r.collectionId, name: r.collectionName ?? "" } : null }),
      }
    : { ...base, type: r.type, seasons: r.seasons ?? [], episodeRuntimeMinutes: r.episodeRuntimeMinutes ?? 0, ...(r.watchOrder ? { watchOrder: r.watchOrder } : {}) };
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
    watchOrder: t.type === "movie" ? null : (t.watchOrder ?? null),
    // Same convention as partOf: "" is "checked, no saga", null is "not checked yet".
    collectionId: t.type === "movie" && t.collection !== undefined ? (t.collection?.id ?? "") : null,
    collectionName: t.type === "movie" ? (t.collection?.name ?? null) : null,
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
    partOverrides: r.partOverrides,
    updates: r.updates,
  };
}

function toSharedWatch(r: typeof schema.sharedWatches.$inferSelect): SharedWatch {
  return {
    id: r.id,
    titleId: r.titleId,
    hostId: r.hostId,
    memberIds: r.memberIds,
    createdAt: r.createdAt.toISOString(),
    updatedBy: r.updatedBy,
    updatedAt: r.updatedAt?.toISOString() ?? null,
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
    status: r.status,
    scheduledFor: r.scheduledFor ? iso(r.scheduledFor) : null,
  };
}

function toPresence(r: typeof schema.presence.$inferSelect): Presence {
  return { ...r, startedAt: iso(r.startedAt), updatedAt: iso(r.updatedAt) };
}
