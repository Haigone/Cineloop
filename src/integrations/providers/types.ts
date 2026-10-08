import type { MediaType, ProviderId } from "@/domain/types";

/**
 * Provider integration contract.
 *
 * CineLoop never plays content and never talks to a provider on the user's
 * behalf with their credentials. Data reaches an adapter only through
 * channels the user explicitly enables: today the CineLoop browser extension,
 * which reports the URL and title of the provider tab the user has open.
 * See docs/providers.md and docs/browser-extension.md.
 */

/** A provider-side reference to something watchable. */
export interface Content {
  providerId: ProviderId;
  /** The provider's own id, when it exposes one in URLs (e.g. Netflix /watch/{id}). */
  externalId: string | null;
  title: string;
  type: MediaType | null;
  season: number | null;
  episode: number | null;
  /** Catalog id once matched by the CatalogService. */
  titleId: string | null;
}

export interface CurrentContent extends Content {
  url: string | null;
  detectedAt: string;
  /** Provider id of the show an episode belongs to, when known. */
  parentId?: string | null;
}

export interface AdapterWatchProgress {
  content: Content;
  /** 0–1 when known; detection does not require it. */
  fraction: number | null;
  updatedAt: string;
}

/**
 * Raw observation sent by a sync source (the browser extension). Adapters
 * turn it into structured content; they never fetch anything themselves.
 */
export interface SyncObservation {
  providerId: ProviderId;
  url: string;
  documentTitle: string;
  /** Structured hints the extension could read from public page metadata. */
  hints?: {
    title?: string;
    season?: number;
    episode?: number;
    /** How far through the video the player is, 0–1. */
    progress?: number;
    /** The provider's id for the show, when the tab came from its page (Netflix ?jbv= or /title/{id}). */
    parentId?: string;
  };
  observedAt: string;
}

export interface ProviderCapabilities {
  /** Can recognise what the user is watching from a sync observation. */
  detectCurrentContent: boolean;
  /** Can build a URL that opens the title on the provider. */
  deepLinks: boolean;
  /** Can report progress inside an episode or film. */
  progress: boolean;
}

export interface AdapterContext {
  userId: string;
  /** Latest observation received from the user's sync source, if any. */
  latestObservation: SyncObservation | null;
}

export interface ProviderAdapter {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;
  getCurrentContent(ctx: AdapterContext): Promise<CurrentContent | null>;
  getWatchProgress(ctx: AdapterContext): Promise<AdapterWatchProgress | null>;
  getContinueWatching(ctx: AdapterContext): Promise<Content[]>;
  getContentUrl(content: Content): string | null;
}
