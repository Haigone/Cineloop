import type { ProviderCapabilities, CurrentContent, SyncObservation, Content } from "../types";
import { ObservationAdapter } from "./base";

/**
 * Netflix. STATUS: under review — detection is disabled.
 *
 * Verified facts (see docs/providers.md):
 * - Netflix has no public API for viewing activity or playback state.
 * - Its Terms of Use forbid automated means to access the service.
 * - Users can download their own viewing history (Account > Download your
 *   personal information) — a legitimate future import path.
 *
 * Planned approach: the user's own browser extension reads the URL and the
 * visible page title of the tab the user has open (no network calls, no
 * cookies, no DOM scraping of the player) and pushes an observation.
 * `parse` below implements only that URL interpretation; it ships disabled
 * until the approach is reviewed against Netflix's terms.
 */
export class NetflixAdapter extends ObservationAdapter {
  readonly id = "netflix" as const;
  readonly capabilities: ProviderCapabilities = { detectCurrentContent: false, deepLinks: true, progress: false };

  protected parse(obs: SyncObservation): CurrentContent | null {
    const match = /^https:\/\/www\.netflix\.com\/watch\/(\d+)/.exec(obs.url);
    if (!match) return null;
    const title = obs.hints?.title ?? obs.documentTitle.replace(/\s*[-|]\s*Netflix\s*$/i, "").trim();
    if (!title) return null;
    return {
      providerId: this.id,
      externalId: match[1]!,
      title,
      type: null,
      season: obs.hints?.season ?? null,
      episode: obs.hints?.episode ?? null,
      titleId: null,
      url: `https://www.netflix.com/watch/${match[1]}`,
      detectedAt: obs.observedAt,
    };
  }

  override getContentUrl(content: Content): string | null {
    // A /watch/{id} URL resumes playback for the signed-in user on Netflix itself.
    return content.externalId ? `https://www.netflix.com/watch/${content.externalId}` : "https://www.netflix.com";
  }
}
