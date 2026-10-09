import type { ProviderCapabilities, CurrentContent, SyncObservation, Content, AdapterContext, AdapterWatchProgress } from "../types";
import { ObservationAdapter } from "./base";

/**
 * Reads only the HTTPS title page and hints explicitly reported by CineLoop's
 * user-enabled extension. StreamingCommunity's host changes, so accept a
 * single-level hostname whose name identifies the service and require a
 * /watch/{id} or /titles/{id} path. No provider requests are made here.
 */
export class StreamingCommunityAdapter extends ObservationAdapter {
  readonly id = "streamingcommunity" as const;
  readonly capabilities: ProviderCapabilities = {
    detectCurrentContent: true,
    deepLinks: true,
    progress: true,
  };

  protected parse(obs: SyncObservation): CurrentContent | null {
    const url = this.parsePageUrl(obs.url);
    if (!url) return null;

    const rawTitle = obs.hints?.title?.trim() ||
      obs.documentTitle.replace(/\s*[-|–·]\s*(streaming\s*community.*|streamingcommunity.*)$/i, "").trim();
    const cleanedTitle = rawTitle.replace(/^watch\s+/i, "").trim();
    const title = /^(streaming\s*community|film|serie tv)$/i.test(cleanedTitle) ? "" : cleanedTitle.slice(0, 200);
    const season = Number.isInteger(obs.hints?.season) && (obs.hints?.season ?? 0) > 0
      ? obs.hints!.season!
      : null;
    const episode = Number.isInteger(obs.hints?.episode) && (obs.hints?.episode ?? 0) > 0
      ? obs.hints!.episode!
      : null;

    return {
      providerId: this.id,
      externalId: url,
      title,
      type: null,
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
      const host = url.hostname.toLowerCase().replace(/^www\./, "");
      // Domains rotate; require the service name and a normal single-level host.
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        !/^(?:streaming[-]?community[a-z0-9-]*|streamingcommunityz[a-z0-9-]*)\.[a-z]{2,}$/i.test(host) ||
        !/^(?:\/(?:[a-z]{2}\/)?watch\/\d{1,9}(?:\/|$)|\/titles?\/\d{1,9}(?:[-/?#]|$))/i.test(url.pathname)
      ) return null;
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }
}
