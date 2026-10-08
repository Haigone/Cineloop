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

  // Users & credentials
  getUserById(id: string): Promise<User | null>;
  getUserByUsername(username: string): Promise<User | null>;
  getCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null>;
  createUser(input: { username: string; displayName: string; email: string; passwordHash: string }): Promise<User>;
  searchUsers(query: string, limit: number): Promise<PublicUser[]>;

  // Sessions (token is stored hashed)
  createSession(input: { tokenHash: string; userId: string; expiresAt: Date }): Promise<void>;
  getSession(tokenHash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  deleteSession(tokenHash: string): Promise<void>;

  // Library & progress
  listLibrary(userId: string): Promise<LibraryEntry[]>;
  setLibraryStatus(userId: string, titleId: string, status: WatchStatus): Promise<void>;
  setRating(userId: string, titleId: string, value: RatingValue | null): Promise<void>;
  saveProgress(userId: string, progress: WatchProgress): Promise<void>;
  listWatchEvents(userId: string, since: Date): Promise<WatchEvent[]>;

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

  // Watch parties
  createWatchParty(party: Omit<WatchParty, "id" | "createdAt">): Promise<WatchParty>;
  setWatchPartyPick(partyId: string, hostId: string, titleId: string): Promise<void>;
  listWatchParties(userId: string, limit: number): Promise<WatchParty[]>;

  // Notifications & preferences
  listNotifications(userId: string): Promise<AppNotification[]>;
  markNotificationsRead(userId: string): Promise<void>;
  getPreferences(userId: string): Promise<UserPreferences>;
  updatePreferences(userId: string, patch: Partial<Omit<UserPreferences, "userId">>): Promise<UserPreferences>;
  updateProfile(userId: string, patch: { displayName?: string; bio?: string | null }): Promise<User>;
}
