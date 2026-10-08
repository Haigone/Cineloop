import "server-only";
import type { LibraryEntry, PublicUser, Title, User, WatchProgress } from "@/domain/types";
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
  continueUrl: string | null;
}

export function toContinueItem(entry: LibraryEntry, title: Title): ContinueItem | null {
  if (!entry.progress) return null;
  const provider = getProvider(entry.progress.providerId);
  const continueUrl = entry.progress.providerId
    ? resolveContinueUrl(
        {
          providerId: entry.progress.providerId,
          externalId: null,
          title: title.title,
          type: title.type,
          season: entry.progress.season,
          episode: entry.progress.episode,
          titleId: title.id,
        },
        entry.progress.url,
      )
    : null;
  return { title, progress: entry.progress, providerName: provider?.name ?? null, continueUrl };
}

/** Activity from the given users, leaving out anyone who chose not to share it. */
export async function listSharedActivity(repo: Repository, userIds: readonly string[], limit: number) {
  const prefs = await Promise.all(userIds.map((id) => repo.getPreferences(id)));
  const sharing = prefs.filter((p) => p.shareActivity).map((p) => p.userId);
  return sharing.length ? repo.listActivity(sharing, limit) : [];
}
