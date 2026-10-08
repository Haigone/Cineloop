import type { ProviderCapabilities, CurrentContent, SyncObservation, Content } from "../types";
import { ObservationAdapter } from "./base";

/** Document titles Netflix uses on pages that say nothing about the title. */
const GENERIC_TITLES = new Set(["", "netflix", "home", "watch"]);

/**
 * Netflix. Detection runs on observations from the CineLoop browser
 * extension, which the user installs and pairs themselves.
 *
 * Verified facts (see docs/providers.md):
 * - Netflix has no public API for viewing activity or playback state, so
 *   nothing here calls Netflix.
 * - The extension reports the URL and document title of the tab the user is
 *   watching in, plus what the player names as playing (show, season,
 *   episode) as hints: no cookies, no network interception, nothing else
 *   from the page. `parse` turns a `/watch/{id}` URL into content; the
 *   catalog match happens server-side (learned links, the player's name,
 *   then the user confirming in the extension popup).
 */
export class NetflixAdapter extends ObservationAdapter {
  readonly id = "netflix" as const;
  readonly capabilities: ProviderCapabilities = { detectCurrentContent: true, deepLinks: true, progress: false };

  protected parse(obs: SyncObservation): CurrentContent | null {
    const match = /^https:\/\/www\.netflix\.com\/watch\/(\d{1,12})(?:[/?#]|$)/.exec(obs.url);
    if (!match) return null;
    const fromPage = obs.documentTitle.replace(/\s*[-|]\s*Netflix.*$/i, "").trim();
    const title = obs.hints?.title?.trim() || (GENERIC_TITLES.has(fromPage.toLowerCase()) ? "" : fromPage);
    const parent = obs.hints?.parentId && /^\d{1,12}$/.test(obs.hints.parentId) ? obs.hints.parentId : null;
    return {
      providerId: this.id,
      externalId: match[1]!,
      parentId: parent,
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
