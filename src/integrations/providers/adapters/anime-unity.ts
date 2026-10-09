import type { ProviderCapabilities, CurrentContent, SyncObservation, Content } from "../types";
import { ObservationAdapter } from "./base";

/**
 * Anime Unity page-link adapter.
 *
 * Consumes only an HTTPS page URL already supplied to CineLoop by an
 * explicitly enabled observation source. It never fetches the site, inspects
 * page markup, extracts media URLs, or controls a player.
 */
export class AnimeUnityAdapter extends ObservationAdapter {
  readonly id = "animeunity" as const;
  readonly capabilities: ProviderCapabilities = {
    detectCurrentContent: true,
    deepLinks: true,
    progress: false,
  };

  protected parse(obs: SyncObservation): CurrentContent | null {
    const url = this.parsePageUrl(obs.url);
    if (!url) return null;

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
      externalId: url,
      title: fromPage,
      type: "anime",
      season,
      episode,
      titleId: null,
      url,
      detectedAt: obs.observedAt,
    };
  }

  override getContentUrl(content: Content): string | null {
    if (content.providerId !== this.id || !content.externalId) return null;
    return this.parsePageUrl(content.externalId);
  }

  private parsePageUrl(value: string): string | null {
    try {
      const url = new URL(value);
      // Require HTTPS and an actual "animeunity" domain label. This rejects
      // path-only and hostname lookalikes such as animeunity.evil.example.
      if (
        url.protocol !== "https:" ||
        !url.hostname.toLowerCase().split(".").includes("animeunity") ||
        url.username ||
        url.password
      ) return null;
      return url.toString();
    } catch {
      return null;
    }
  }
}
