import type { ProviderCapabilities, CurrentContent, SyncObservation, Content, AdapterWatchProgress, AdapterContext } from "../types";
import { ObservationAdapter } from "./base";

const AU_HOST = "animeunity.so";
const AU_HOME = "https://www.animeunity.so";

/** Resolve explicitly named AnimeUnity cours to their canonical season number. */
export function animeUnityPartSeason(url: string, title: string): number | null {
  const text = (url + " " + title).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/the[-_\s]+blood[-_\s]+warfare|blood[-_\s]+warfare/.test(text)) return 1;
  if (/the[-_\s]+separation|\bseparation\b/.test(text)) return 2;
  if (/the[-_\s]+conflict|\bconflict\b/.test(text)) return 3;
  if (/the[-_\s]+calamity|\bcalamity\b/.test(text)) return 4;
  const numbered = /(?:season|stagione|part|parte|cour)\s*[-:]?\s*([1-9]\d?)/i.exec(text);
  return numbered ? Number(numbered[1]) : null;
}


/**
 * Anime Unity adapter for page URLs and playback progress observed by the
 * user's extension. It does not fetch the site or inspect media URLs.
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
      : animeUnityPartSeason(url, fromPage);
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
    if (content.providerId !== this.id) return null;
    // A catalogue title without a previously observed page still gets a useful
    // provider link; saved progress uses the exact URL stored with that progress.
    if (!content.externalId) return AU_HOME;
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
      url.searchParams.delete("cineloopResume");
      return url.toString();
    } catch {
      return null;
    }
  }
}
