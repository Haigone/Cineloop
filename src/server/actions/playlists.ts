"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { ensureTitle } from "@/server/services/explore";
import type { ActionResult } from "./library";

/** Mutations for the viewer's own playlists (the owner is always the signed-in user, never an argument). */

const name = z.string().trim().min(1, "Dai un nome alla playlist.").max(60, "Il nome è troppo lungo.");
const visibility = z.enum(["private", "friends"]);
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

export async function createPlaylist(input: { name: string; visibility: "private" | "friends"; titleId?: string }): Promise<ActionResult & { id?: string }> {
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

export async function updatePlaylist(playlistId: string, patch: { name?: string; visibility?: "private" | "friends" }): Promise<ActionResult> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  const next: { name?: string; visibility?: "private" | "friends" } = {};
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

/** Puts a title in a playlist or takes it out. */
export async function setInPlaylist(playlistId: string, titleId: string, present: boolean): Promise<ActionResult> {
  const user = await getCurrentUser();
  const pid = id.safeParse(playlistId);
  const tid = z.string().min(1).max(120).safeParse(titleId);
  if (!pid.success || !tid.success) return { ok: false, error: "Richiesta non valida." };
  if (present && !(await ensureTitle(tid.data))) return { ok: false, error: "Titolo non trovato." };
  return run(() => getRepository().setPlaylistItem(user.id, pid.data, tid.data, present), "Non siamo riusciti ad aggiornare la playlist.");
}
