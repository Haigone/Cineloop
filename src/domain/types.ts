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
  /** For a film that belongs to an anime series (Bleach, Demon Slayer): that series' id. */
  partOf?: string | null;
}

export interface SeasonSummary {
  number: number;
  episodeCount: number;
  /** The season's own name when it has one ("Stone Ocean"), from the catalogue. */
  name?: string;
  /** First air date (YYYY-MM-DD), when the catalogue knows it. */
  airDate?: string;
}

export interface Series extends BaseTitle {
  type: "series" | "anime";
  seasons: SeasonSummary[];
  episodeRuntimeMinutes: number;
}

export type Title = Movie | Series;

/** Where a title lives in CineLoop: a film made from an anime series is with the anime. */
export function sectionOf(title: Title): MediaType {
  return title.type === "movie" && title.partOf ? "anime" : title.type;
}

/** Something coming out: a film, a new series, or a new season of one. */
export interface Release {
  title: Title;
  /** First release (or first episode) date, YYYY-MM-DD; null when announced without a date. */
  date: string | null;
  /** For a series that is coming back, the new season's number. */
  season: number | null;
  /** On a streaming service, or only in cinemas. Unset when it does not matter (a followed series). */
  venue?: "streaming" | "cinema";
}

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
  /**
   * For a series marked as seen: the last season the user had watched. A later
   * season that has aired since is "Novità".
   */
  seenThrough?: number | null;
  /** Just finished (the last episode, or the film to the end): Home asks for a rating. */
  askRating?: boolean;
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
  /** Where it was watched, when known (the extension reports it). */
  providerId?: ProviderId | null;
}

/** One row of an aggregated chart: a title and how many people watched it. */
export interface ChartEntry {
  titleId: string;
  viewers: number;
  minutes: number;
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
  /** While watching with the extension, friends see you live with "Guarda insieme". */
  liveVisible: boolean;
  /** The viewer's own top 3, in order (first place first). Shown as a podium in Classifiche. */
  podium: string[];
  notifyFriendActivity: boolean;
  notifyWatchParty: boolean;
  notifySuggestions: boolean;
  reduceMotion: boolean;
  /** Services the user pays for. Used to favour titles they can actually watch; nothing is synced. */
  subscriptions: ProviderId[];
  /** The Home section opened last: Home opens on it next time. */
  homeCategory: MediaType;
  /** Title chosen as each Home section's background; otherwise the last one watched there. */
  homeBackgrounds: Partial<Record<MediaType, string>>;
}

/**
 * What a user is watching right now, as reported by their CineLoop browser
 * extension. Kept alive by heartbeats; stale after a few minutes of silence.
 */
export interface Presence {
  userId: string;
  providerId: ProviderId;
  /** The provider's id from the page URL (e.g. Netflix /watch/{id}). */
  externalId: string;
  /** Catalog title, once recognised or confirmed by the user. */
  titleId: string | null;
  /** Best guess at the title from the page, shown until it is recognised. */
  label: string | null;
  season: number | null;
  episode: number | null;
  /** Where a friend can open the same thing on the provider. */
  url: string;
  /** Optional watch-together room (Teleparty or similar) the host shared. */
  partyUrl: string | null;
  /** Friends who joined from CineLoop. */
  guestIds: string[];
  startedAt: string;
  updatedAt: string;
  /** Minutes watched that are not yet stored as a watch event. */
  pendingMinutes: number;
}

/**
 * A watch-together room: the host's session plus the friends who joined it.
 * Every member's extension reports its player; a play or pause by anyone is
 * applied by the others' extensions.
 */
export interface PartyState {
  /** The room's state after the last play or pause. */
  paused: boolean;
  /** Player position (seconds) when that happened. */
  position: number;
  at: string;
  /** Who pressed it. */
  by: string;
  /** Increases with every play or pause, so each one is applied once. */
  seq: number;
  /** Each member's last report, to say who is ahead or behind. */
  members: Record<string, { externalId: string; position: number; paused: boolean; at: string }>;
}

/** A browser extension paired with an account. Its token is stored hashed. */
export interface ExtensionDevice {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
}
