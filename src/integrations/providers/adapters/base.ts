import type { ProviderId } from "@/domain/types";
import { PROVIDERS } from "@/domain/providers";
import type {
  AdapterContext,
  AdapterWatchProgress,
  Content,
  CurrentContent,
  ProviderAdapter,
  ProviderCapabilities,
  SyncObservation,
} from "../types";

/**
 * Shared behaviour for adapters that only interpret observations pushed by
 * the CineLoop extension. Subclasses implement `parse` for their URL scheme.
 * With no observation, every method resolves to "nothing known".
 */
export abstract class ObservationAdapter implements ProviderAdapter {
  abstract readonly id: ProviderId;
  abstract readonly capabilities: ProviderCapabilities;

  /** Turn an observation into content, or null if the page is not playback. */
  protected abstract parse(observation: SyncObservation): CurrentContent | null;

  async getCurrentContent(ctx: AdapterContext): Promise<CurrentContent | null> {
    if (!this.capabilities.detectCurrentContent) return null;
    const obs = ctx.latestObservation;
    if (!obs || obs.providerId !== this.id) return null;
    return this.parse(obs);
  }

  async getWatchProgress(ctx: AdapterContext): Promise<AdapterWatchProgress | null> {
    const current = await this.getCurrentContent(ctx);
    return current ? { content: current, fraction: null, updatedAt: current.detectedAt } : null;
  }

  async getContinueWatching(): Promise<Content[]> {
    // No provider exposes a sanctioned "continue watching" feed to third parties.
    return [];
  }

  getContentUrl(content: Content): string | null {
    void content;
    return PROVIDERS[this.id].homepage;
  }
}

/**
 * Adapter for providers whose integration is not approved. It deliberately
 * does nothing: no detection, no links. Keeps the registry complete so the
 * UI can render every provider without special cases.
 */
export class DisabledAdapter implements ProviderAdapter {
  readonly capabilities: ProviderCapabilities = { detectCurrentContent: false, deepLinks: false, progress: false };
  constructor(readonly id: ProviderId) {}
  async getCurrentContent(): Promise<CurrentContent | null> {
    return null;
  }
  async getWatchProgress(): Promise<AdapterWatchProgress | null> {
    return null;
  }
  async getContinueWatching(): Promise<Content[]> {
    return [];
  }
  getContentUrl(content?: Content): string | null {
    void content;
    return null;
  }
}
