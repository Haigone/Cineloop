import "server-only";
import type { LibraryEntry, PublicUser, Title, User, WatchProgress } from "@/domain/types";
import { seriesProgress } from "@/domain/library";
import { getProvider } from "@/domain/providers";
import { resolveContinueUrl } from "@/integrations/providers/registry";
import type { Repository } from "@/server/data";

export function toPublicUser(u: User | PublicUser): PublicUser {
  return { id: u.id, username: u.username, displayName: u.displayName, avatarUrl: u.avatarUrl, bio: u.bio };
}

export async function titleMap(repo: Repository, ids: Iterable<string>): Promise<Map<string, Title>> {
  const unique = [...new Set(ids)];
  const titles = await repo.getTitlesByIds(unique);
  return new Map(titles.map((t) => [t.id, t]));
}

export interface FriendBundle {
  user: PublicUser;
  since: string;
  library: LibraryEntry[];
  wishlist: Awaited<ReturnType<Repository["listWishlist"]>>;
}

/** Friends with their libraries and wishlists, loaded in parallel. */
export async function loadFriendBundles(repo: Repository, userId: string): Promise<FriendBundle[]> {
  const friends = await repo.listFriends(userId);
  return Promise.all(
    friends.map(async (f) => ({
      user: f.user,
      since: f.since,
      library: await repo.listLibrary(f.user.id),
      wishlist: await repo.listWishlist(f.user.id),
    })),
  );
}

export interface ContinueItem {
  title: Title;
  progress: WatchProgress;
  providerName: string | null;
  /** Where "Continua" goes: the service, or CineLoop's title page when unknown. */
  continueUrl: string | null;
  continueOnSite: boolean;
  /** True when the extension reports it playing right now. */
  live: boolean;
  /** For series: how far through the whole series (current episode included), 0–1. */
  seriesFraction: number | null;
  /** "Episodio 5 di 9" style position in the season, when known. */
  seasonEpisodes: number | null;
}

/** Append a one-shot seek hint for the Anime Unity extension, preserving the page URL. */
export function animeUnityResumeUrl(value: string, fraction: number): string {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "animeunity.so" || host.endsWith(".animeunity.so"))) return value;
    url.searchParams.set("cineloopResume", String(Math.min(1, Math.max(0, fraction))));
    return url.toString();
  } catch {
    return value;
  }
}

export function toContinueItem(entry: LibraryEntry, title: Title): ContinueItem | null {
  if (!entry.progress) return null;
  const providerId =
    entry.progress.providerId ?? title.providers.find((id) => getProvider(id)?.homepage) ?? null;
  const provider = getProvider(providerId);
  const resolvedUrl = providerId
    ? resolveContinueUrl(
        {
          providerId,
          externalId: null,
          title: title.title,
          type: title.type,
          season: entry.progress.season,
          episode: entry.progress.episode,
          titleId: title.id,
        },
        entry.progress.providerId === providerId ? entry.progress.url : null,
      )
    : null;
  const providerUrl = resolvedUrl && providerId === "animeunity" && entry.progress.providerId === "animeunity"
    ? animeUnityResumeUrl(resolvedUrl, entry.progress.fraction)
    : resolvedUrl;
  const continueUrl = providerUrl ?? `/title/${title.id}`;
  const season = title.type === "movie" ? undefined : title.seasons.find((s) => s.number === entry.progress!.season);
  return {
    title,
    progress: entry.progress,
    providerName: providerUrl ? (provider?.name ?? null) : null,
    continueUrl,
    continueOnSite: !providerUrl,
    live: false,
    seriesFraction: seriesProgress(title, entry.progress),
    seasonEpisodes: season?.episodeCount ?? null,
  };
}

/** Activity from the given users, leaving out anyone who chose not to share it. */
export async function listSharedActivity(repo: Repository, userIds: readonly string[], limit: number) {
  const prefs = await Promise.all(userIds.map((id) => repo.getPreferences(id)));
  const sharing = prefs.filter((p) => p.shareActivity).map((p) => p.userId);
  return sharing.length ? repo.listActivity(sharing, limit) : [];
}
