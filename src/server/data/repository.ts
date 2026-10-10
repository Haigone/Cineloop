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

/**
 * Persistence contract. Two implementations exist: an in-memory store seeded
 * with demo data (no setup needed) and a Drizzle/PostgreSQL store. Services
 * depend on this interface only, so swapping storage never touches the UI.
 *
 * Methods are plain data access; business rules live in `src/domain`.
 */
export interface Repository {
  readonly kind: "memory" | "postgres";

  // Catalog cache
  listTitles(): Promise<Title[]>;
  getTitlesByIds(ids: readonly string[]): Promise<Title[]>;
  searchTitles(query: string, limit: number): Promise<Title[]>;
  /**
   * Replace a catalog title by another everywhere it is used (libraries, wishlists, activity,
   * links, films made from it). Where a user already has the new one, theirs is kept.
   * Returns how many users' entries moved and how many were merged into an existing one.
   */
  replaceTitle(oldId: string, next: Title): Promise<{ moved: number; merged: number }>;
  /** Insert or refresh titles fetched from a CatalogService. */
  upsertTitles(titles: readonly Title[]): Promise<void>;

  // Users & credentials
  listUsers(): Promise<User[]>;
  getUserById(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null>;
  getPasswordHash(userId: string): Promise<string | null>;
  updatePassword(userId: string, passwordHash: string): Promise<void>;
  createUser(input: { username: string; displayName: string; email: string; passwordHash: string }): Promise<User>;
  searchUsers(query: string, limit: number): Promise<PublicUser[]>;

  // Sessions (token is stored hashed)
  createSession(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void>;
  getSession(tokenHash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteSession(tokenHash: string): Promise<void>;
  /** Signs the user out everywhere except, optionally, the session doing the change. */
  deleteUserSessions(userId: string, exceptTokenHash?: string): Promise<void>;

  // Library & progress
  listLibrary(userId: string): Promise<LibraryEntry[]>;
  setLibraryStatus(userId: string, titleId: string, status: WatchStatus): Promise<void>;
  /** Takes a title out of the library, with its progress and rating. */
  removeFromLibrary(userId: string, titleId: string): Promise<void>;
  /** Marks a series as seen up to the end of a season (status "completed", no progress). */
  markSeenThrough(userId: string, titleId: string, season: number): Promise<void>;
  /** Watched to the end: seen, up to `seenThrough` for a series, and a rating to ask for if there is none. */
  markFinished(userId: string, titleId: string, seenThrough: number | null): Promise<void>;
  /** Stops asking for a rating ("Non ora"). */
  dismissRatingPrompt(userId: string, titleId: string): Promise<void>;
  /** Includes or leaves out one part of an anime franchise (or "filler"); null goes back to the default. Needs a library entry. */
  setPartOverride(userId: string, titleId: string, key: string, included: boolean | null): Promise<void>;
  setRating(userId: string, titleId: string, value: RatingValue | null): Promise<void>;
  saveProgress(userId: string, progress: WatchProgress): Promise<void>;
  listWatchEvents(userId: string, since: Date): Promise<WatchEvent[]>;
  addWatchEvent(event: WatchEvent): Promise<void>;
  /** Titles watched by the most people since a date, among users who share their activity. */
  topWatched(input: { since: Date; providerId?: ProviderId; limit: number }): Promise<ChartEntry[]>;
  /** A cached external chart and when it was fetched. */
  getChart(id: string): Promise<{ data: unknown; fetchedAt: Date } | null>;
  saveChart(id: string, data: unknown): Promise<void>;

  // Wishlist
  listWishlist(userId: string): Promise<WishlistItem[]>;
  addToWishlist(userId: string, titleId: string, suggestedBy?: string | null): Promise<void>;
  removeFromWishlist(userId: string, titleId: string): Promise<void>;
  reorderWishlist(userId: string, orderedTitleIds: readonly string[]): Promise<void>;

  // Social
  listFriends(userId: string): Promise<Friend[]>;
  addFriend(userId: string, friendId: string): Promise<void>;
  removeFriend(userId: string, friendId: string): Promise<void>;
  listActivity(userIds: readonly string[], limit: number): Promise<ActivityEvent[]>;
  recordActivity(event: Omit<ActivityEvent, "id">): Promise<void>;

  // Watch parties
  createWatchParty(party: Omit<WatchParty, "id" | "createdAt">): Promise<WatchParty>;
  setWatchPartyPick(partyId: string, hostId: string, titleId: string): Promise<void>;
  listWatchParties(userId: string, limit: number): Promise<WatchParty[]>;

  // Browser extension: pairing, devices, live presence
  /** One-time pairing code, stored hashed, valid until `expiresAt`. */
  createPairingCode(input: { codeHash: string; userId: string; expiresAt: Date }): Promise<void>;
  /** Returns the owner and deletes the code, or null when unknown or expired. */
  consumePairingCode(codeHash: string): Promise<string | null>;
  createExtensionDevice(input: { id: string; userId: string; tokenHash: string; label: string }): Promise<void>;
  /** Resolves a device token and records that it was used. */
  useExtensionToken(tokenHash: string): Promise<{ deviceId: string; userId: string } | null>;
  listExtensionDevices(userId: string): Promise<ExtensionDevice[]>;
  deleteExtensionDevice(userId: string, deviceId: string): Promise<void>;
  getPresence(userId: string): Promise<Presence | null>;
  listPresence(userIds: readonly string[]): Promise<Presence[]>;
  savePresence(presence: Presence): Promise<void>;
  clearPresence(userId: string): Promise<void>;
  /** The watch-together room hosted by this user, if any. */
  getParty(hostId: string): Promise<PartyState | null>;
  saveParty(hostId: string, party: PartyState | null): Promise<void>;
  /** Catalog title a provider id was matched to, trying ids in order. */
  findProviderLink(providerId: ProviderId, externalIds: readonly string[]): Promise<string | null>;
  saveProviderLink(input: { providerId: ProviderId; externalId: string; titleId: string; userId: string }): Promise<void>;

  // Notifications & preferences
  listNotifications(userId: string): Promise<AppNotification[]>;
  createNotification(notification: Omit<AppNotification, "id" | "read"> & { userId: string }): Promise<void>;
  markNotificationsRead(userId: string): Promise<void>;
  getPreferences(userId: string): Promise<UserPreferences>;
  updatePreferences(userId: string, patch: Partial<Omit<UserPreferences, "userId">>): Promise<UserPreferences>;
  updateProfile(userId: string, patch: { displayName?: string; bio?: string | null }): Promise<User>;
}
