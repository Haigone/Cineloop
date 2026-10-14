"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle } from "@/server/services/explore";
import type { PlaylistVisibility } from "@/domain/types";
import type { ActionResult } from "./library";
import { missingFromWishlist } from "@/domain/community";

/** Mutations for the viewer's own playlists (the owner is always the signed-in user, never an argument). */

const name = z.string().trim().min(1, "Dai un nome alla playlist.").max(60, "Il nome è troppo lungo.");
const visibility = z.enum(["private", "friends", "collaborative"]);
const id = z.string().min(1).max(80);
const MAX_PLAYLISTS = 30;

async function run(fn: () => Promise<boolean>, failure: string): Promise<ActionResult> {
  try {
    if (!(await fn())) return { ok: false, error: "Playlist non trovata." };
    refresh();
    return { ok: true };
  } catch (err) {
    console.error(failure, err);
    return { ok: false, error: failure };
  }
}

export async function createPlaylist(input: { name: string; visibility: PlaylistVisibility; titleId?: string }): Promise<ActionResult & { id?: string }> {
  const user = await getCurrentUser();
  const parsedName = name.safeParse(input.name);
  const parsedVisibility = visibility.safeParse(input.visibility);
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0]?.message ?? "Nome non valido." };
  if (!parsedVisibility.success) return { ok: false, error: "Visibilità non valida." };
  const repo = getRepository();
  const existing = await repo.listPlaylists(user.id);
  if (existing.length >= MAX_PLAYLISTS) return { ok: false, error: `Puoi avere al massimo ${MAX_PLAYLISTS} playlist.` };
  if (existing.some((p) => p.name.toLowerCase() === parsedName.data.toLowerCase())) return { ok: false, error: "Hai già una playlist con questo nome." };
  try {
    const playlist = await repo.createPlaylist(user.id, parsedName.data, parsedVisibility.data);
    if (input.titleId && (await ensureTitle(input.titleId))) await repo.setPlaylistItem(user.id, playlist.id, input.titleId, true);
    refresh();
    return { ok: true, id: playlist.id };
  } catch (err) {
    console.error("createPlaylist failed", err);
    return { ok: false, error: "Non siamo riusciti a creare la playlist." };
  }
}

export async function updatePlaylist(playlistId: string, patch: { name?: string; visibility?: PlaylistVisibility; published?: boolean }): Promise<ActionResult> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  const next: { name?: string; visibility?: PlaylistVisibility; published?: boolean } = {};
  if (patch.published !== undefined) next.published = patch.published === true;
  if (patch.name !== undefined) {
    const n = name.safeParse(patch.name);
    if (!n.success) return { ok: false, error: n.error.issues[0]?.message ?? "Nome non valido." };
    next.name = n.data;
  }
  if (patch.visibility !== undefined) {
    const v = visibility.safeParse(patch.visibility);
    if (!v.success) return { ok: false, error: "Visibilità non valida." };
    next.visibility = v.data;
  }
  if (!pid.success) return { ok: false, error: "Playlist non trovata." };
  return run(() => getRepository().updatePlaylist(user.id, pid.data, next), "Non siamo riusciti a salvare la playlist.");
}

export async function deletePlaylist(playlistId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  if (!pid.success) return { ok: false, error: "Playlist non trovata." };
  return run(() => getRepository().deletePlaylist(user.id, pid.data), "Non siamo riusciti a eliminare la playlist.");
}

/** Puts a title in a playlist or takes it out. The owner always can; friends only in a collaborative one. */
export async function setInPlaylist(playlistId: string, titleId: string, present: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  const tid = z.string().min(1).max(120).safeParse(titleId);
  if (!pid.success || !tid.success) return { ok: false, error: "Richiesta non valida." };
  if (present && !(await ensureTitle(tid.data))) return { ok: false, error: "Titolo non trovato." };
  const repo = getRepository();
  const playlist = await repo.getPlaylist(pid.data);
  if (!playlist) return { ok: false, error: "Playlist non trovata." };
  if (playlist.ownerId !== user.id) {
    const friends = playlist.visibility === "collaborative" ? await repo.listFriends(user.id) : [];
    // A private or friends-only playlist looks, to anyone else, like it does not exist.
    if (!friends.some((f) => f.user.id === playlist.ownerId)) return { ok: false, error: "Playlist non trovata." };
  }
  return run(() => repo.setPlaylistItem(playlist.ownerId, playlist.id, tid.data, present), "Non siamo riusciti ad aggiornare la playlist.");
}

/** Who may read a playlist: its owner, anyone once it is in Community, the owner's friends when shared with them. */
async function visiblePlaylist(viewerId: string, playlistId: string) {
  const repo = getRepository();
  const playlist = await repo.getPlaylist(playlistId);
  if (!playlist) return null;
  if (playlist.ownerId === viewerId || playlist.publishedAt) return playlist;
  if (playlist.visibility === "private") return null;
  const friends = await repo.listFriends(viewerId);
  return friends.some((f) => f.user.id === playlist.ownerId) ? playlist : null;
}

/** Saves a Community playlist in the viewer's wishlist area, or takes it out. It stays the owner's: the saver only reads it. */
export async function setPlaylistSaved(playlistId: string, saved: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  if (!pid.success) return { ok: false, error: "Playlist non trovata." };
  const repo = getRepository();
  if (saved) {
    const playlist = await repo.getPlaylist(pid.data);
    if (!playlist?.publishedAt) return { ok: false, error: "Questa playlist non è più nella Community." };
    if (playlist.ownerId === user.id) return { ok: false, error: "È già una tua playlist." };
  }
  return run(async () => {
    await repo.setPlaylistSaved(user.id, pid.data, saved);
    return true;
  }, "Non siamo riusciti a salvare la playlist.");
}

/**
 * Puts in the viewer's wishlist every title of the playlist that is not there yet, in the playlist's
 * order, so nothing ends up twice. Titles already being watched or seen are left out too.
 */
export async function addPlaylistToWishlist(playlistId: string): Promise<ActionResult & { added?: number }> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  if (!pid.success) return { ok: false, error: "Playlist non trovata." };
  const playlist = await visiblePlaylist(user.id, pid.data);
  if (!playlist) return { ok: false, error: "Playlist non trovata." };
  const repo = getRepository();
  try {
    const [wishlist, library] = await Promise.all([repo.listWishlist(user.id), repo.listLibrary(user.id)]);
    const missing = missingFromWishlist(playlist.titleIds, wishlist.map((w) => w.titleId), library.map((e) => e.titleId));
    // The wishlist puts new titles on top: adding from the last keeps the playlist's order up there.
    for (const titleId of [...missing].reverse()) await repo.addToWishlist(user.id, titleId);
    if (missing.length > 0) refresh();
    return { ok: true, added: missing.length };
  } catch (err) {
    console.error("addPlaylistToWishlist failed", err);
    return { ok: false, error: "Non siamo riusciti ad aggiungere i titoli alla wishlist." };
  }
}
