import type { ProviderCapabilities, CurrentContent, SyncObservation, Content } from "../types";
import { ObservationAdapter } from "./base";

/**
 * Anime Unity page-link adapter.
 *
 * It only accepts a user-visible HTTPS page URL from an observation already
 * supplied to CineLoop. It does not fetch Anime Unity, inspect page contents,
 * discover media files, or interact with a player. Keeping the full page URL
 * lets "Continue" reopen the same page when that URL was saved as progress.
 */
export class AnimeUnityAdapter extends ObservationAdapter {
  readonly id = "animeunity" as const;
  readonly capabilities: ProviderCapabilities = {
    detectCurrentContent: true,
    deepLinks: true,
    progress: false,
  };

  protected parse(obs: SyncObservation): CurrentContent | null {
    let url: URL;
    try {
      url = new URL(obs.url);
    } catch {
      return null;
    }

    // Restrict links to HTTPS hosts whose domain labels identify Anime Unity.
    // This rejects lookalike paths such as evil.example/animeunity.
    if (
      url.protocol !== "https:" ||
      !url.hostname.split(".").some((label) => label.toLowerCase().includes("animeunity"))
    ) {
      return null;
    }

    const fromPage = obs.hints?.title?.trim() ||
      obs.documentTitle.replace(/\s*[-|–]\s*anime\s*unity.*$/i, "").trim();
    const season = Number.isInteger(obs.hints?.season) && (obs.hints?.season ?? 0) > 0
      ? obs.hints!.season!
      : null;
    const episode = Number.isInteger(obs.hints?.episode) && (obs.hints?.episode ?? 0) > 0
      ? obs.hints!.episode!
      : null;

    return {
      providerId: this.id,
      // Preserve the page URL as the provider reference so Continue can reopen
      // the exact user-visible page. No media/stream URL is extracted.
      externalId: url.toString(),
      title: fromPage,
      type: "anime",
      season,
      episode,
      titleId: null,
      url: url.toString(),
      detectedAt: obs.observedAt,
    };
  }

  override getContentUrl(content: Content): string | null {
    if (content.providerId !== this.id || !content.externalId) return null;
    try {
      const url = new URL(content.externalId);
      if (
        url.protocol === "https:" &&
        url.hostname.split(".").some((label) => label.toLowerCase().includes("animeunity"))
      ) return url.toString();
    } catch {
      // Invalid or missing saved page URL.
    }
    return null;
  }
}
