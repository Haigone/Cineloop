import type { AdapterContext, AdapterWatchProgress, Content, CurrentContent, ProviderCapabilities, SyncObservation } from "../types";
import { ObservationAdapter } from "./base";

const HOME = "https://www.primevideo.com";
/** A short Prime Video id (ASIN-like, upper case) or a full amzn1.dv.gti.{uuid}. */
const ID = /^(?:[A-Z0-9]{10,40}|amzn1\.dv\.gti\.[0-9a-f-]{36})$/;
const DETAIL = /\/(?:detail|dp)\/(?:[^/]+\/)?([A-Z0-9]{10,40}|amzn1\.dv\.gti\.[0-9a-f-]{36})(?:[/?#]|$)/;
const TITLE_KEY = "title:";

/** Prime Video pages the extension may report: primevideo.com, or amazon.it/gp/video. */
function primePage(value: string): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (url.hostname === "www.primevideo.com") return url;
    if (url.hostname === "www.amazon.it" && url.pathname.startsWith("/gp/video/")) return url;
    return null;
  } catch {
    return null;
  }
}

const detailUrl = (id: string) => `${HOME}/detail/${id}/`;
const searchUrl = (title: string) => `${HOME}/search/?phrase=${encodeURIComponent(title)}`;

/**
 * Prime Video. Amazon has no public API for viewing activity or playback
 * (see docs/providers.md), so detection runs, as for Netflix, on what the
 * user's CineLoop extension reports from the tab they are watching in.
 *
 * Prime Video opens its player on top of the title page, with no playback URL
 * of its own: the extension (prime-page.js) says when the player is open and
 * what it names (show, season, episode). The id is the one of the title page
 * (/detail/{id}); started from elsewhere, the name read in the player stands
 * in for it.
 */
export class PrimeVideoAdapter extends ObservationAdapter {
  readonly id = "prime-video" as const;
  readonly capabilities: ProviderCapabilities = { detectCurrentContent: true, deepLinks: true, progress: true };

  protected parse(obs: SyncObservation): CurrentContent | null {
    const page = primePage(obs.url);
    if (!page) return null;
    const title = (obs.hints?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    const id = DETAIL.exec(page.pathname)?.[1] ?? null;
    if (!id && !title) return null;
    return {
      providerId: this.id,
      externalId: id ?? `${TITLE_KEY}${title.toLowerCase()}`,
      title,
      type: null,
      season: obs.hints?.season ?? null,
      episode: obs.hints?.episode ?? null,
      titleId: null,
      url: id ? detailUrl(id) : searchUrl(title),
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
    const id = content.externalId;
    if (id && ID.test(id)) return detailUrl(id);
    if (id?.startsWith(TITLE_KEY)) return searchUrl(content.title || id.slice(TITLE_KEY.length));
    return HOME;
  }
}
