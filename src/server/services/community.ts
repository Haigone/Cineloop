import "server-only";
import type { Playlist, PublicUser, Title } from "@/domain/types";
import { missingFromWishlist } from "@/domain/community";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository, type Repository } from "@/server/data";
import { toPublicUser } from "./shared";

/** How many published playlists the Community page shows. */
const COMMUNITY_LIMIT = 60;

/** A playlist published in Community, as one viewer sees it. */
export interface CommunityPlaylistView {
  playlist: Playlist;
  titles: Title[];
  /** Who published it; null when the account is gone. */
  owner: PublicUser | null;
  /** How many people saved it. */
  saves: number;
  /** The viewer saved it. */
  saved: boolean;
  /** The viewer published it. */
  mine: boolean;
  /** Its titles the viewer's wishlist does not have yet (nor the library), in the playlist's order. */
  missing: string[];
}

async function toViews(repo: Repository, viewerId: string, rows: { playlist: Playlist; saves: number }[]): Promise<CommunityPlaylistView[]> {
  if (rows.length === 0) return [];
  const ownerIds = [...new Set(rows.map((r) => r.playlist.ownerId))];
  const [owners, titles, wishlist, library, saved] = await Promise.all([
    Promise.all(ownerIds.map((id) => repo.getUserById(id))),
    repo.getTitlesByIds([...new Set(rows.flatMap((r) => r.playlist.titleIds))]),
    repo.listWishlist(viewerId),
    repo.listLibrary(viewerId),
    repo.listSavedPlaylists(viewerId),
  ]);
  const ownerById = new Map(owners.flatMap((u) => (u ? [[u.id, toPublicUser(u)] as const] : [])));
  const titleById = new Map(titles.map((t) => [t.id, t]));
  const savedIds = new Set(saved.map((p) => p.id));
  const wishlistIds = wishlist.map((w) => w.titleId);
  const libraryIds = library.map((e) => e.titleId);
  return rows.map(({ playlist, saves }) => {
    const shown = playlist.titleIds.flatMap((id) => titleById.get(id) ?? []);
    return {
      playlist,
      titles: shown,
      owner: ownerById.get(playlist.ownerId) ?? null,
      saves,
      saved: savedIds.has(playlist.id),
      mine: playlist.ownerId === viewerId,
      missing: missingFromWishlist(
        shown.map((t) => t.id),
        wishlistIds,
        libraryIds,
      ),
    };
  });
}

/** Everything published in Community, newest first. */
export async function getCommunityView(): Promise<CommunityPlaylistView[]> {
  const viewer = await getCurrentUser();
  const repo = getRepository();
  return toViews(repo, viewer.id, await repo.listCommunityPlaylists(COMMUNITY_LIMIT));
}

/** The Community playlists the viewer saved, for their own section of the wishlist. */
export async function getSavedPlaylistsView(viewerId: string): Promise<CommunityPlaylistView[]> {
  const repo = getRepository();
  const saved = await repo.listSavedPlaylists(viewerId);
  if (saved.length === 0) return [];
  // Save counts are a Community detail; the wishlist section does not show them.
  return toViews(
    repo,
    viewerId,
    saved.map((playlist) => ({ playlist, saves: 0 })),
  );
}
