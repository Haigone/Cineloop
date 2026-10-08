import type {
  ActivityEvent,
  AppNotification,
  Friend,
  LibraryEntry,
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
import { hashPasswordSync } from "@/server/auth/password";
import { searchKey } from "@/lib/text";
import type { Repository } from "./repository";
import { SEED_TITLES } from "./seed/catalog";
import { buildSeed, DEMO_PASSWORD } from "./seed/people";

/**
 * In-memory repository backed by demo seed data. Used when DATABASE_URL is not
 * set, so the app runs with zero setup. State lives for the server process.
 */
export class MemoryRepository implements Repository {
  readonly kind = "memory" as const;

  private titles = new Map<string, Title>();
  private users = new Map<string, User>();
  private passwords = new Map<string, string>();
  private sessions = new Map<string, { userId: string; expiresAt: Date }>();
  private friendships: { a: string; b: string; since: string }[] = [];
  private library: LibraryEntry[] = [];
  private wishlist: WishlistItem[] = [];
  private watchEvents: WatchEvent[] = [];
  private activity: ActivityEvent[] = [];
  private parties: WatchParty[] = [];
  private notifications = new Map<string, AppNotification[]>();
  private preferences = new Map<string, UserPreferences>();

  constructor(now: Date = new Date()) {
    for (const t of SEED_TITLES) this.titles.set(t.id, t);
    const seed = buildSeed(now);
    // Every demo account shares the demo password; hash it once.
    const demoHash = hashPasswordSync(DEMO_PASSWORD);
    for (const u of seed.users) {
      this.users.set(u.id, u);
      this.passwords.set(u.id, demoHash);
    }
    this.friendships = seed.friendships;
    this.library = seed.library;
    this.wishlist = seed.wishlist;
    this.watchEvents = seed.watchEvents;
    this.activity = seed.activity;
    this.notifications = seed.notifications;
    for (const p of seed.preferences) this.preferences.set(p.userId, p);
  }

  // Catalog -----------------------------------------------------------------

  async listTitles() {
    return [...this.titles.values()];
  }

  async getTitlesByIds(ids: readonly string[]) {
    return ids.map((id) => this.titles.get(id)).filter((t): t is Title => Boolean(t));
  }

  async searchTitles(query: string, limit: number) {
    const q = searchKey(query);
    if (!q) return [];
    return [...this.titles.values()]
      .map((t) => ({ t, i: searchKey(t.title).indexOf(q) }))
      .filter((x) => x.i >= 0)
      .sort((x, y) => x.i - y.i || x.t.title.localeCompare(y.t.title))
      .slice(0, limit)
      .map((x) => x.t);
  }

  // Users -------------------------------------------------------------------

  async getUserById(id: string) {
    return this.users.get(id) ?? null;
  }

  async getUserByUsername(username: string) {
    const u = username.toLowerCase();
    return [...this.users.values()].find((x) => x.username === u) ?? null;
  }

  async getCredentialsByEmail(email: string) {
    const e = email.toLowerCase();
    const user = [...this.users.values()].find((x) => x.email === e);
    if (!user) return null;
    const passwordHash = this.passwords.get(user.id);
    return passwordHash ? { user, passwordHash } : null;
  }

  async getPasswordHash(userId: string) {
    return this.passwords.get(userId) ?? null;
  }

  async updatePassword(userId: string, passwordHash: string) {
    this.passwords.set(userId, passwordHash);
  }

  async createUser(input: { username: string; displayName: string; email: string; passwordHash: string }) {
    const user: User = {
      id: `u_${crypto.randomUUID()}`,
      username: input.username.toLowerCase(),
      displayName: input.displayName,
      email: input.email.toLowerCase(),
      avatarUrl: null,
      bio: null,
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    this.passwords.set(user.id, input.passwordHash);
    this.preferences.set(user.id, defaultPreferences(user.id));
    return user;
  }

  async searchUsers(query: string, limit: number) {
    const q = searchKey(query);
    if (!q) return [];
    return [...this.users.values()]
      .filter((u) => searchKey(u.displayName).includes(q) || u.username.includes(q))
      .slice(0, limit)
      .map(toPublic);
  }

  // Sessions ----------------------------------------------------------------

  async createSession(input: { tokenHash: string; userId: string; expiresAt: Date }) {
    this.sessions.set(input.tokenHash, { userId: input.userId, expiresAt: input.expiresAt });
  }

  async deleteUserSessions(userId: string, exceptTokenHash?: string) {
    for (const [hash, s] of this.sessions) if (s.userId === userId && hash !== exceptTokenHash) this.sessions.delete(hash);
  }

  async getSession(tokenHash: string) {
    return this.sessions.get(tokenHash) ?? null;
  }

  async deleteSession(tokenHash: string) {
    this.sessions.delete(tokenHash);
  }

  // Library -----------------------------------------------------------------

  async listLibrary(userId: string) {
    return this.library.filter((e) => e.userId === userId);
  }

  async setLibraryStatus(userId: string, titleId: string, status: WatchStatus) {
    const entry = this.findEntry(userId, titleId);
    if (entry) {
      entry.status = status;
      if (status === "completed") entry.progress = null;
    } else {
      this.library.push({
        userId,
        titleId,
        status,
        addedAt: new Date().toISOString(),
        lastWatchedAt: null,
        rating: null,
        progress: null,
      });
    }
  }

  async setRating(userId: string, titleId: string, value: RatingValue | null) {
    const entry = this.findEntry(userId, titleId);
    if (entry) {
      entry.rating = value;
    } else if (value !== null) {
      this.library.push({
        userId,
        titleId,
        status: "completed",
        addedAt: new Date().toISOString(),
        lastWatchedAt: new Date().toISOString(),
        rating: value,
        progress: null,
      });
    }
  }

  async saveProgress(userId: string, progress: WatchProgress) {
    const entry = this.findEntry(userId, progress.titleId);
    if (entry) {
      entry.progress = progress;
      entry.status = "watching";
      entry.lastWatchedAt = progress.updatedAt;
    } else {
      this.library.push({
        userId,
        titleId: progress.titleId,
        status: "watching",
        addedAt: progress.updatedAt,
        lastWatchedAt: progress.updatedAt,
        rating: null,
        progress,
      });
    }
  }

  async listWatchEvents(userId: string, since: Date) {
    const s = since.getTime();
    return this.watchEvents.filter((e) => e.userId === userId && Date.parse(e.watchedAt) >= s);
  }

  // Wishlist ----------------------------------------------------------------

  async listWishlist(userId: string) {
    return this.wishlist.filter((w) => w.userId === userId).sort((a, b) => a.position - b.position);
  }

  async addToWishlist(userId: string, titleId: string, suggestedBy: string | null = null) {
    const mine = this.wishlist.filter((w) => w.userId === userId);
    if (mine.some((w) => w.titleId === titleId)) return;
    // New items go to the top, like a queue you just added to.
    for (const w of mine) w.position += 1;
    this.wishlist.push({ userId, titleId, addedAt: new Date().toISOString(), position: 0, suggestedBy });
  }

  async removeFromWishlist(userId: string, titleId: string) {
    this.wishlist = this.wishlist.filter((w) => !(w.userId === userId && w.titleId === titleId));
    this.wishlist
      .filter((w) => w.userId === userId)
      .sort((a, b) => a.position - b.position)
      .forEach((w, i) => (w.position = i));
  }

  async reorderWishlist(userId: string, orderedTitleIds: readonly string[]) {
    const index = new Map(orderedTitleIds.map((id, i) => [id, i]));
    for (const w of this.wishlist) {
      if (w.userId === userId && index.has(w.titleId)) w.position = index.get(w.titleId)!;
    }
  }

  // Social ------------------------------------------------------------------

  async listFriends(userId: string) {
    const friends: Friend[] = [];
    for (const f of this.friendships) {
      const otherId = f.a === userId ? f.b : f.b === userId ? f.a : null;
      const other = otherId ? this.users.get(otherId) : undefined;
      if (other) friends.push({ user: toPublic(other), since: f.since });
    }
    return friends;
  }

  async addFriend(userId: string, friendId: string) {
    if (userId === friendId) return;
    const exists = this.friendships.some((f) => (f.a === userId && f.b === friendId) || (f.a === friendId && f.b === userId));
    if (!exists) this.friendships.push({ a: userId, b: friendId, since: new Date().toISOString() });
  }

  async removeFriend(userId: string, friendId: string) {
    this.friendships = this.friendships.filter(
      (f) => !((f.a === userId && f.b === friendId) || (f.a === friendId && f.b === userId)),
    );
  }

  async listActivity(userIds: readonly string[], limit: number) {
    const ids = new Set(userIds);
    return this.activity
      .filter((a) => ids.has(a.userId))
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
      .slice(0, limit);
  }

  // Watch parties -----------------------------------------------------------

  async createWatchParty(input: Omit<WatchParty, "id" | "createdAt">) {
    const party: WatchParty = { ...input, id: `wp_${crypto.randomUUID()}`, createdAt: new Date().toISOString() };
    this.parties.push(party);
    return party;
  }

  async setWatchPartyPick(partyId: string, hostId: string, titleId: string) {
    const party = this.parties.find((p) => p.id === partyId && p.hostId === hostId);
    if (party) party.pickedTitleId = titleId;
  }

  async listWatchParties(userId: string, limit: number) {
    return this.parties
      .filter((p) => p.hostId === userId || p.participantIds.includes(userId))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }

  // Notifications & preferences --------------------------------------------

  async listNotifications(userId: string) {
    return this.notifications.get(userId) ?? [];
  }

  async markNotificationsRead(userId: string) {
    for (const n of this.notifications.get(userId) ?? []) n.read = true;
  }

  async getPreferences(userId: string) {
    let prefs = this.preferences.get(userId);
    if (!prefs) {
      prefs = defaultPreferences(userId);
      this.preferences.set(userId, prefs);
    }
    return prefs;
  }

  async updatePreferences(userId: string, patch: Partial<Omit<UserPreferences, "userId">>) {
    const next = { ...(await this.getPreferences(userId)), ...patch };
    this.preferences.set(userId, next);
    return next;
  }

  async updateProfile(userId: string, patch: { displayName?: string; bio?: string | null }) {
    const user = this.users.get(userId);
    if (!user) throw new Error("User not found");
    const next = { ...user, ...patch };
    this.users.set(userId, next);
    return next;
  }

  private findEntry(userId: string, titleId: string) {
    return this.library.find((e) => e.userId === userId && e.titleId === titleId);
  }
}

export function defaultPreferences(userId: string): UserPreferences {
  return {
    userId,
    profileVisibility: "friends",
    shareActivity: true,
    notifyFriendActivity: true,
    notifyWatchParty: true,
    notifySuggestions: true,
    reduceMotion: false,
    subscriptions: [],
  };
}

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, bio: u.bio };
}
