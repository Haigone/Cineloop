import type {
  ActivityEvent,
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
  private pairingCodes = new Map<string, { userId: string; expiresAt: Date }>();
  private devices: (ExtensionDevice & { userId: string; tokenHash: string })[] = [];
  private presence = new Map<string, Presence>();
  private rooms = new Map<string, PartyState>();
  private providerLinks = new Map<string, string>();
  /** Seeded presences that stay live without an extension sending heartbeats. */
  private demoLive = new Set<string>();
  private charts = new Map<string, { data: unknown; fetchedAt: Date }>();

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
    // Demo: Luca is watching on Netflix right now, so "Guarda insieme" can be tried.
    this.presence.set("u_luca", {
      userId: "u_luca",
      providerId: "netflix",
      externalId: "80077368",
      titleId: "stranger-things",
      label: "Stranger Things",
      season: 4,
      episode: 7,
      url: "https://www.netflix.com/watch/80077368",
      partyUrl: null,
      guestIds: [],
      startedAt: new Date(now.getTime() - 25 * 60_000).toISOString(),
      updatedAt: now.toISOString(),
      pendingMinutes: 0,
    });
    this.demoLive.add("u_luca");
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

  async upsertTitles(titles: readonly Title[]) {
    for (const t of titles) this.titles.set(t.id, t);
  }

  // Users -------------------------------------------------------------------

  async listUsers() {
    return [...this.users.values()];
  }

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

  async markSeenThrough(userId: string, titleId: string, season: number) {
    const now = new Date().toISOString();
    const entry = this.findEntry(userId, titleId);
    if (entry) Object.assign(entry, { status: "completed", progress: null, seenThrough: season, lastWatchedAt: now });
    else this.library.push({ userId, titleId, status: "completed", addedAt: now, lastWatchedAt: now, rating: null, progress: null, seenThrough: season });
  }

  async markFinished(userId: string, titleId: string, seenThrough: number | null) {
    const now = new Date().toISOString();
    const entry = this.findEntry(userId, titleId);
    const set = { status: "completed" as const, progress: null, seenThrough, lastWatchedAt: now };
    if (entry) Object.assign(entry, set, { askRating: entry.rating === null });
    else this.library.push({ userId, titleId, addedAt: now, rating: null, askRating: true, ...set });
  }

  async removeFromLibrary(userId: string, titleId: string) {
    this.library = this.library.filter((e) => !(e.userId === userId && e.titleId === titleId));
  }

  async setPartOverride(userId: string, titleId: string, key: string, included: boolean | null) {
    const entry = this.library.find((e) => e.userId === userId && e.titleId === titleId);
    if (!entry) return;
    const next = { ...entry.partOverrides };
    if (included === null) delete next[key];
    else next[key] = included;
    entry.partOverrides = next;
  }

  async dismissRatingPrompt(userId: string, titleId: string) {
    const entry = this.findEntry(userId, titleId);
    if (entry) entry.askRating = false;
  }

  async setRating(userId: string, titleId: string, value: RatingValue | null) {
    const entry = this.findEntry(userId, titleId);
    if (entry) {
      entry.rating = value;
      if (value !== null) entry.askRating = false;
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

  async addWatchEvent(event: WatchEvent) {
    this.watchEvents.push({ ...event });
  }

  async topWatched({ since, providerId, limit }: { since: Date; providerId?: ProviderId; limit: number }) {
    const byTitle = new Map<string, { users: Set<string>; minutes: number }>();
    for (const e of this.watchEvents) {
      if (Date.parse(e.watchedAt) < since.getTime() || (providerId && e.providerId !== providerId)) continue;
      if (!(await this.getPreferences(e.userId)).shareActivity) continue;
      const row = byTitle.get(e.titleId) ?? { users: new Set<string>(), minutes: 0 };
      row.users.add(e.userId);
      row.minutes += e.minutes;
      byTitle.set(e.titleId, row);
    }
    return [...byTitle.entries()]
      .map(([titleId, r]): ChartEntry => ({ titleId, viewers: r.users.size, minutes: r.minutes }))
      .sort((a, b) => b.viewers - a.viewers || b.minutes - a.minutes)
      .slice(0, limit);
  }

  async getChart(id: string) {
    return this.charts.get(id) ?? null;
  }

  async saveChart(id: string, data: unknown) {
    this.charts.set(id, { data, fetchedAt: new Date() });
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

  async recordActivity(event: Omit<ActivityEvent, "id">) {
    this.activity.push({ ...event, id: `a_${crypto.randomUUID()}` });
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

  // Browser extension -------------------------------------------------------

  async createPairingCode(input: { codeHash: string; userId: string; expiresAt: Date }) {
    this.pairingCodes.set(input.codeHash, { userId: input.userId, expiresAt: input.expiresAt });
  }

  async consumePairingCode(codeHash: string) {
    const code = this.pairingCodes.get(codeHash);
    this.pairingCodes.delete(codeHash);
    return code && code.expiresAt.getTime() > Date.now() ? code.userId : null;
  }

  async createExtensionDevice(input: { id: string; userId: string; tokenHash: string; label: string }) {
    this.devices.push({ ...input, createdAt: new Date().toISOString(), lastUsedAt: null });
  }

  async useExtensionToken(tokenHash: string) {
    const device = this.devices.find((d) => d.tokenHash === tokenHash);
    if (!device) return null;
    device.lastUsedAt = new Date().toISOString();
    return { deviceId: device.id, userId: device.userId };
  }

  async listExtensionDevices(userId: string) {
    return this.devices
      .filter((d) => d.userId === userId)
      .map(({ id, label, createdAt, lastUsedAt }) => ({ id, label, createdAt, lastUsedAt }));
  }

  async deleteExtensionDevice(userId: string, deviceId: string) {
    this.devices = this.devices.filter((d) => !(d.userId === userId && d.id === deviceId));
  }

  async getPresence(userId: string) {
    const p = this.presence.get(userId);
    if (!p) return null;
    return this.demoLive.has(userId) ? { ...p, guestIds: [...p.guestIds], updatedAt: new Date().toISOString() } : { ...p, guestIds: [...p.guestIds] };
  }

  async listPresence(userIds: readonly string[]) {
    const found = await Promise.all(userIds.map((id) => this.getPresence(id)));
    return found.filter((p): p is Presence => Boolean(p));
  }

  async savePresence(presence: Presence) {
    this.presence.set(presence.userId, { ...presence, guestIds: [...presence.guestIds] });
  }

  async clearPresence(userId: string) {
    this.presence.delete(userId);
  }

  async getParty(hostId: string) {
    const p = this.rooms.get(hostId);
    return p ? structuredClone(p) : null;
  }

  async saveParty(hostId: string, party: PartyState | null) {
    if (party) this.rooms.set(hostId, structuredClone(party));
    else this.rooms.delete(hostId);
  }

  async findProviderLink(providerId: ProviderId, externalIds: readonly string[]) {
    for (const id of externalIds) {
      const titleId = this.providerLinks.get(`${providerId}:${id}`);
      if (titleId) return titleId;
    }
    return null;
  }

  async saveProviderLink(input: { providerId: ProviderId; externalId: string; titleId: string; userId: string }) {
    this.providerLinks.set(`${input.providerId}:${input.externalId}`, input.titleId);
  }

  // Notifications & preferences --------------------------------------------

  async listNotifications(userId: string) {
    return this.notifications.get(userId) ?? [];
  }

  async createNotification(input: Omit<AppNotification, "id" | "read"> & { userId: string }) {
    const { userId, ...rest } = input;
    const list = this.notifications.get(userId) ?? [];
    list.unshift({ ...rest, id: `n_${crypto.randomUUID()}`, read: false });
    this.notifications.set(userId, list);
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
    liveVisible: true,
    podium: [],
    notifyFriendActivity: true,
    notifyWatchParty: true,
    notifySuggestions: true,
    reduceMotion: false,
    subscriptions: [],
    homeCategory: "series",
    homeBackgrounds: {},
  };
}

function toPublic(u: User): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, bio: u.bio };
}
