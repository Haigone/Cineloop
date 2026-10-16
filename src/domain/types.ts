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
  /** The saga or trilogy the film is part of; null for a film of its own, unset when not checked yet. */
  collection?: CollectionRef | null;
}

/** A saga of films ("Il Signore degli Anelli - La trilogia"), by its catalogue id. */
export interface CollectionRef {
  /** Namespaced like titles: "tmdb-collection-119". */
  id: string;
  name: string;
}

/** One film of a saga, with its release date. */
export interface CollectionPart {
  title: Movie;
  /** First release in Italy when known, else worldwide (YYYY-MM-DD); null when announced without a date. */
  releaseDate: string | null;
}

/** A saga with all its films, in release order (undated ones last). */
export interface FilmCollection extends CollectionRef {
  overview: string;
  artwork: Artwork;
  parts: CollectionPart[];
}

/**
 * How a user watches a saga: their own order (empty = release order) and the
 * films they leave out, which do not count for "finished" and are never suggested.
 */
export interface CollectionChoice {
  collectionId: string;
  order: string[];
  excluded: string[];
}

export interface SeasonSummary {
  number: number;
  episodeCount: number;
  /** The season's own name when it has one ("Stone Ocean"), from the catalogue. */
  name?: string;
  /** First air date (YYYY-MM-DD), when the catalogue knows it. */
  airDate?: string;
}

/** One piece of an anime franchise: a season, a film, an OVA or a special. */
export interface WatchPart {
  /** Stable id of the part, e.g. "ann-4658". */
  key: string;
  kind: "season" | "movie" | "ova" | "special";
  name: string;
  year: number | null;
  episodes: number | null;
  /** False when it is known not to be canon (a recap, a filler film); null when no source says. */
  canon: boolean | null;
  /** For a season: its number in `seasons`. */
  season?: number;
  /** For a season: the episodes a source marks as filler. */
  filler?: number[];
  /** For a season: every kind of episode as [first, last] runs (Anime Filler List's quick list). */
  quickList?: {
    mangaCanon: [number, number][];
    animeCanon: [number, number][];
    mixed: [number, number][];
    filler: [number, number][];
  };
}

export interface Series extends BaseTitle {
  type: "series" | "anime";
  seasons: SeasonSummary[];
  episodeRuntimeMinutes: number;
  /** For an anime from the anime sources: the whole franchise in watching order. */
  watchOrder?: WatchPart[];
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
  /** For a series airing now, one episode a week: the next episode's number. */
  episode?: number | null;
  /** A new season whose main show page could not be found: the card is the season's own entry. */
  mainNotFound?: boolean;
  /** On a streaming service, only in cinemas, or in the anime season calendar (platform unknown). Unset when it does not matter (a followed series). */
  venue?: "streaming" | "cinema" | "seasonal";
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
  /** Null for a guest: an account started with only a username, not registered yet. */
  email: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
}

/** A guest picked only a username; their saves live on until they register. */
export function isGuest(user: Pick<User, "email">): boolean {
  return user.email === null;
}

/** Outside accounts someone can sign in with, besides email and password. */
export type OAuthProvider = "google" | "discord";

export const OAUTH_LABELS: Record<OAuthProvider, string> = { google: "Google", discord: "Discord" };

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

/**
 * News about a finished series: "all" = in Novità and a notification on release day;
 * "releaseDay" = out of Novità, only the notification on the day a season or episode comes out;
 * "none" = out of Novità, no notification, not shown as awaited.
 */
export type TitleUpdates = "all" | "releaseDay" | "none";

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
  /** What the user still wants to hear about this series; unset = "all". */
  updates?: TitleUpdates;
  /** Anime: parts the user chose to include (true) or leave out (false), by part key; "filler" = watch filler episodes. */
  partOverrides?: Record<string, boolean>;
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

/**
 * A named list of titles in the wishlist area ("Natale", "Halloween"). Only the owner renames or
 * deletes it; in a "collaborative" one the owner's friends can also add and remove titles.
 */
export type PlaylistVisibility = "private" | "friends" | "collaborative";

export interface Playlist {
  id: string;
  ownerId: string;
  name: string;
  /** "friends": the owner's friends can load it into a watch party; "collaborative": and they can edit its titles. */
  visibility: PlaylistVisibility;
  /** In the order the owner put them. */
  titleIds: string[];
  createdAt: string;
  /** When the owner published it in Community, where anyone can see and save it; null when not published. */
  publishedAt: string | null;
}

/**
 * "Serata insieme": a series or anime a group of friends watches together. Its
 * progress is shared: when one member moves on, every member's place moves too.
 */
export interface SharedWatch {
  id: string;
  titleId: string;
  /** Who started it. */
  hostId: string;
  /** Everyone in it, the host included. */
  memberIds: string[];
  createdAt: string;
  /** The member who moved the shared place last, and when. */
  updatedBy: string | null;
  updatedAt: string | null;
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
  /**
   * "done": saved only (older nights). "started": being watched, with a Serata insieme on Home.
   * "scheduled": starts at `scheduledFor`. "queued": starts when the host's current nights are finished.
   */
  status?: WatchPartyStatus;
  scheduledFor?: string | null;
}

export type WatchPartyStatus = "done" | "started" | "scheduled" | "queued";

export type NotificationKind = "friend-activity" | "suggestion" | "watch-party" | "system";

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  message: string;
  href: string | null;
  at: string;
  read: boolean;
}

/**
 * Services that CineLoop reads only after the user accepted a notice on the
 * site: unlicensed streaming sites. "pending" = the extension saw one and the
 * notice has not been answered yet.
 */
export const CONSENT_PROVIDERS = ["animeunity", "streamingcommunity"] as const;
export type ConsentProvider = (typeof CONSENT_PROVIDERS)[number];
export type ConsentState = "pending" | "accepted" | "declined";

export function isConsentProvider(id: string): id is ConsentProvider {
  return (CONSENT_PROVIDERS as readonly string[]).includes(id);
}

export interface UserPreferences {
  userId: string;
  profileVisibility: "public" | "friends" | "private";
  shareActivity: boolean;
  /** While watching with the extension, friends see you live with "Guarda insieme". */
  liveVisible: boolean;
  /** The viewer's own top 3, in order (first place first). Shown as a podium in Classifiche. */
  podium: string[];
  /** The viewer's top 3 per category (first place first); `podium` above is what it was before categories. */
  podiums: Partial<Record<MediaType, string[]>>;
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
  /** Answer to the notice shown before CineLoop reads AnimeUnity / StreamingCommunity. */
  providerConsent: Partial<Record<ConsentProvider, ConsentState>>;
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
  /** The room's clock: paused or running from `position` (seconds) at `at`. Set by the last play, pause or seek, otherwise by the host's player. */
  paused: boolean;
  position: number;
  at: string;
  /** Who last pressed play, pause or moved the bar, and which. */
  by: string;
  last?: "play" | "pause" | "seek";
  /** Increases with every play, pause or seek. */
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
