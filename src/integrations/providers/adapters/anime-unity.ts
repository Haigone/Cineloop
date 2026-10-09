import type { ProviderCapabilities, CurrentContent, SyncObservation, Content, AdapterWatchProgress, AdapterContext } from "../types";
import { ObservationAdapter } from "./base";

const AU_HOST = "animeunity.so";

/**
 * Anime Unity adapter for page URLs and progress already observed by the
 * user's CineLoop extension. It does not fetch the site or inspect media URLs.
 */
export class AnimeUnityAdapter extends ObservationAdapter {
  readonly id = "animeunity" as const;
  readonly capabilities: ProviderCapabilities = {
    detectCurrentContent: true,
    deepLinks: true,
    progress: true,
  };

  protected parse(obs: SyncObservation): CurrentContent | null {
    const url = this.parsePageUrl(obs.url);
    if (!url || !/^\/anime\/\d{1,9}(?:[-/?#]|$)/i.test(new URL(url).pathname)) return null;

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

  override async getWatchProgress(ctx: AdapterContext): Promise<AdapterWatchProgress | null> {
    const content = await this.getCurrentContent(ctx);
    if (!content) return null;
    const raw = ctx.latestObservation?.hints?.progress;
    const fraction = typeof raw === "number" && Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : null;
    return { content, fraction, updatedAt: content.detectedAt };
  }

  override getContentUrl(content: Content): string | null {
    if (content.providerId !== this.id || !content.externalId) return null;
    return this.parsePageUrl(content.externalId);
  }

  private parsePageUrl(value: string): string | null {
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      if (
        url.protocol !== "https:" ||
        !(host === AU_HOST || host.endsWith(`.${AU_HOST}`)) ||
        url.username ||
        url.password
      ) return null;
      // This is a page URL, not a media URL. Drop the one-shot resume hint so
      // it is never persisted as part of the user's canonical page address.
      url.searchParams.delete("cineloopResume");
      return url.toString();
    } catch {
      return null;
    }
  }
}
