"use server";

import { randomBytes } from "node:crypto";
import { refresh } from "next/cache";
import { z } from "zod";
import { formatPairingCode, normalizePairingCode, PAIRING_TTL_MS } from "@/domain/pairing";
import { getCurrentUser } from "@/server/auth/current-user";
import { getRepository } from "@/server/data";
import { hashSecret } from "@/server/extension/http";
import { joinFriend, type JoinResult } from "@/server/services/sync";
import { toPublicUser } from "@/server/services/shared";
import type { ActionResult } from "./library";

/** A fresh one-time code the user types into the extension. Only its hash is stored. */
export async function createPairingCode(): Promise<{ ok: true; code: string; expiresAt: string } | { ok: false; error: string }> {
  const viewer = await getCurrentUser();
  const code = formatPairingCode(randomBytes(8));
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS);
  try {
    await getRepository().createPairingCode({ codeHash: hashSecret(normalizePairingCode(code)), userId: viewer.id, expiresAt });
    return { ok: true, code, expiresAt: expiresAt.toISOString() };
  } catch (err) {
    console.error("createPairingCode failed", err);
    return { ok: false, error: "Non siamo riusciti a creare il codice. Riprova." };
  }
}

export async function revokeDevice(deviceId: string): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = z.string().min(1).max(80).safeParse(deviceId);
  if (!parsed.success) return { ok: false, error: "Richiesta non valida." };
  try {
    await getRepository().deleteExtensionDevice(viewer.id, parsed.data);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("revokeDevice failed", err);
    return { ok: false, error: "Non siamo riusciti a scollegare l'estensione." };
  }
}

export async function joinWatching(hostId: string): Promise<JoinResult> {
  const viewer = await getCurrentUser();
  const parsed = z.string().min(1).max(80).safeParse(hostId);
  if (!parsed.success) return { ok: false, error: "Richiesta non valida." };
  try {
    const res = await joinFriend(toPublicUser(viewer), parsed.data);
    if (res.ok) refresh();
    return res;
  } catch (err) {
    console.error("joinWatching failed", err);
    return { ok: false, error: "Non siamo riusciti a unirti. Riprova." };
  }
}
