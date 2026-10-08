/**
 * Shared domain model. These types are the contract between the data layer,
 * the services and the UI; nothing here knows about a database or a provider.
 */

export type MediaType = "movie" | "series" | "anime";

export type Genre =
  | "Azione"
  | "Animazione"
  | "Avventura"
  | "Commedia"
  | "Crime"
  | "Dramma"
  | "Fantascienza"
  | "Fantasy"
  | "Horror"
  | "Mistero"
  | "Romance"
  | "Thriller";

export type ProviderId =
  | "netflix"
  | "prime-video"
  | "disney-plus"
  | "apple-tv"
  | "now"
  | "crunchyroll"
  | "animeunity"
  | "streamingcommunity";

/**
 * How far an integration is. Only `available` providers can be linked by users;
 * the rest are shown so the UI is ready but never pretend to sync.
 */
export type ProviderIntegrationStatus = "available" | "planned" | "under-review" | "not-supported";

export interface Provider {
  id: ProviderId;
  name: string;
  /** Brand-adjacent tint used only for the small provider badge dot. */
  tint: string;
  /** Null when there is no stable official domain to link to. */
  homepage: string | null;
  integration: ProviderIntegrationStatus;
}

export interface Artwork {
  posterUrl: string | null;
  backdropUrl: string | null;
  /** Three colours used to render generated key art when no image exists. */
  palette: readonly [string, string, string];
}

interface BaseTitle {
  id: string;
  title: string;
  year: number;
  genres: Genre[];
  overview: string;
  /** Community score on a 0–10 scale, from the catalog. */
  communityRating: number | null;
  artwork: Artwork;
  providers: ProviderId[];
}

export interface Movie extends BaseTitle {
  type: "movie";
  runtimeMinutes: number;
}

export interface SeasonSummary {
  number: number;
  episodeCount: number;
}

export interface Series extends BaseTitle {
  type: "series" | "anime";
  seasons: SeasonSummary[];
  episodeRuntimeMinutes: number;
}

export type Title = Movie | Series;

export interface Episode {
  seriesId: string;
  season: number;
  number: number;
  title: string | null;
  runtimeMinutes: number;
}

export interface User {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

/** What other users may see about someone. */
export type PublicUser = Pick<User, "id" | "username" | "displayName" | "avatarUrl" | "bio">;

export interface Friend {
  user: PublicUser;
  since: string;
}

export type WatchStatus = "watching" | "completed" | "planned" | "dropped";

export interface WatchProgress {
  titleId: string;
  providerId: ProviderId | null;
  season: number | null;
  episode: number | null;
  /** 0–1. For series this is progress through the current episode. */
  fraction: number;
  /** Deep link back to the provider, when the provider exposes one. */
  url: string | null;
  updatedAt: string;
}

/** Half-star rating stored as an integer 1–10 (1 = ½★, 10 = 5★). */
export type RatingValue = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface Rating {
  userId: string;
  titleId: string;
  value: RatingValue;
  ratedAt: string;
}

export interface LibraryEntry {
  userId: string;
  titleId: string;
  status: WatchStatus;
  addedAt: string;
  lastWatchedAt: string | null;
  rating: RatingValue | null;
  progress: WatchProgress | null;
}

export interface WishlistItem {
  userId: string;
  titleId: string;
  addedAt: string;
  /** User-defined order, 0 = top of the list. */
  position: number;
  /** Set when a friend suggested the title. */
  suggestedBy: string | null;
}

export interface WatchEvent {
  userId: string;
  titleId: string;
  watchedAt: string;
  minutes: number;
  season: number | null;
  episode: number | null;
}

export type ActivityKind = "watching" | "completed" | "wishlisted" | "rated";

export interface ActivityEvent {
  id: string;
  userId: string;
  kind: ActivityKind;
  titleId: string;
  at: string;
  season: number | null;
  episode: number | null;
  rating: RatingValue | null;
}

export type WatchPartyFilter = "common" | "movie" | "series" | "anime" | "all";

export interface WatchParty {
  id: string;
  hostId: string;
  participantIds: string[];
  filter: WatchPartyFilter;
  genre: Genre | null;
  candidateTitleIds: string[];
  pickedTitleId: string | null;
  createdAt: string;
}

export type NotificationKind = "friend-activity" | "suggestion" | "watch-party" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  href: string | null;
  at: string;
  read: boolean;
}

export interface UserPreferences {
  userId: string;
  profileVisibility: "public" | "friends" | "private";
  shareActivity: boolean;
  notifyFriendActivity: boolean;
  notifyWatchParty: boolean;
  notifySuggestions: boolean;
  reduceMotion: boolean;
  /** Services the user pays for. Used to favour titles they can actually watch; nothing is synced. */
  subscriptions: ProviderId[];
}
