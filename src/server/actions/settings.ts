"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { PROVIDERS } from "@/domain/providers";
import { sectionOf, type ProviderId } from "@/domain/types";
import { getCurrentUser } from "@/server/auth/current-user";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { currentSessionHash } from "@/server/auth/session";
import { getRepository } from "@/server/data";
import type { ActionResult } from "./library";

export interface FormState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function firstErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0]);
    out[key] ??= issue.message;
  }
  return out;
}

const profileSchema = z.object({
  displayName: z.string().trim().min(2, "Usa almeno 2 caratteri.").max(48, "Massimo 48 caratteri."),
  bio: z.string().trim().max(160, "Massimo 160 caratteri."),
});

export async function updateProfile(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getCurrentUser();
  const parsed = profileSchema.safeParse({ displayName: formData.get("displayName") ?? "", bio: formData.get("bio") ?? "" });
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) };
  try {
    await getRepository().updateProfile(viewer.id, { displayName: parsed.data.displayName, bio: parsed.data.bio || null });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("updateProfile failed", err);
    return { error: "Non siamo riusciti a salvare il profilo. Riprova." };
  }
}

const passwordSchema = z
  .object({
    current: z.string().min(1, "Inserisci la password attuale."),
    next: z.string().min(10, "Usa almeno 10 caratteri.").max(128, "Massimo 128 caratteri."),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Le due password non coincidono." });

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const viewer = await getCurrentUser();
  const parsed = passwordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: firstErrors(parsed.error) };
  try {
    const repo = getRepository();
    const stored = await repo.getPasswordHash(viewer.id);
    if (!stored || !(await verifyPassword(parsed.data.current, stored))) {
      return { fieldErrors: { current: "La password attuale non è corretta." } };
    }
    await repo.updatePassword(viewer.id, await hashPassword(parsed.data.next));
    // Any other device signed in with the old password is signed out.
    await repo.deleteUserSessions(viewer.id, await currentSessionHash());
    return { ok: true };
  } catch (err) {
    console.error("changePassword failed", err);
    return { error: "Non siamo riusciti a cambiare la password. Riprova." };
  }
}

const providerId = z.enum(Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]]);

const preferencesPatch = z
  .object({
    profileVisibility: z.enum(["public", "friends", "private"]),
    shareActivity: z.boolean(),
    liveVisible: z.boolean(),
    notifyFriendActivity: z.boolean(),
    notifyWatchParty: z.boolean(),
    notifySuggestions: z.boolean(),
    reduceMotion: z.boolean(),
    subscriptions: z.array(providerId).max(Object.keys(PROVIDERS).length),
  })
  .partial()
  .strict();

export type PreferencesPatch = z.infer<typeof preferencesPatch>;

export async function updatePreferences(patch: PreferencesPatch): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsed = preferencesPatch.safeParse(patch);
  if (!parsed.success) return { ok: false, error: "Impostazione non valida." };
  try {
    const data = parsed.data;
    if (data.subscriptions) {
      // Only services with a real, official destination can be marked as used.
      data.subscriptions = [...new Set(data.subscriptions)].filter((id) => PROVIDERS[id].homepage !== null);
    }
    await getRepository().updatePreferences(viewer.id, data);
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("updatePreferences failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare l'impostazione. Riprova." };
  }
}

const mediaType = z.enum(["movie", "series", "anime"]);

/** The title behind a Home section, or null to use the last one watched there. */
export async function setHomeBackground(category: string, titleId: string | null): Promise<ActionResult> {
  const viewer = await getCurrentUser();
  const parsedCategory = mediaType.safeParse(category);
  const parsedId = z.string().min(1).max(64).nullable().safeParse(titleId);
  if (!parsedCategory.success || !parsedId.success) return { ok: false, error: "Sfondo non valido." };
  try {
    const repo = getRepository();
    if (parsedId.data) {
      const [title] = await repo.getTitlesByIds([parsedId.data]);
      if (!title || sectionOf(title) !== parsedCategory.data) return { ok: false, error: "Scegli un titolo di questa sezione." };
    }
    const { homeBackgrounds } = await repo.getPreferences(viewer.id);
    const next = { ...homeBackgrounds };
    if (parsedId.data) next[parsedCategory.data] = parsedId.data;
    else delete next[parsedCategory.data];
    await repo.updatePreferences(viewer.id, { homeBackgrounds: next });
    refresh();
    return { ok: true };
  } catch (err) {
    console.error("setHomeBackground failed", err);
    return { ok: false, error: "Non siamo riusciti a salvare lo sfondo. Riprova." };
  }
}
