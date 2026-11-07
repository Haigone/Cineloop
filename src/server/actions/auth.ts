"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { getOptionalUser } from "@/server/auth/current-user";
import { createSession, destroySession, GUEST_SESSION_TTL_MS } from "@/server/auth/session";
import { getRepository } from "@/server/data";
import { isGuest } from "@/domain/types";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "username" | "displayName", string>>;
  values?: { email?: string; username?: string; displayName?: string };
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Inserisci un indirizzo email valido."),
  password: z.string().min(1, "Inserisci la password."),
});

export async function login(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  const email = String(formData.get("email") ?? "");
  if (!parsed.success) {
    return { fieldErrors: fieldErrors(parsed.error), values: { email } };
  }
  try {
    const creds = await getRepository().getCredentialsByEmail(parsed.data.email);
    const ok = creds ? await verifyPassword(parsed.data.password, creds.passwordHash) : false;
    if (!creds || !ok) {
      return { error: "Email o password non corrispondono. Controlla e riprova.", values: { email } };
    }
    await createSession(creds.user.id);
  } catch (err) {
    console.error("login failed", err);
    return { error: "Non riusciamo a raggiungere il server. Riprova tra un momento.", values: { email } };
  }
  redirect(safeRedirect(formData.get("next")));
}

const usernameField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "3–20 caratteri: lettere, numeri o underscore.");

const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Usa almeno 2 caratteri.").max(48, "Massimo 48 caratteri."),
  username: usernameField,
  email: z.string().trim().toLowerCase().email("Inserisci un indirizzo email valido."),
  password: z.string().min(10, "Usa almeno 10 caratteri.").max(128),
});

/**
 * Use CineLoop with just a username: the account is created right away with
 * no email or password, and everything saved goes on it. Registering later
 * fills those in and keeps it all.
 */
export async function startAsGuest(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const values = { username: String(formData.get("username") ?? "") };
  const parsed = usernameField.safeParse(formData.get("username") ?? "");
  if (!parsed.success) return { fieldErrors: { username: parsed.error.issues[0]?.message }, values };

  const repo = getRepository();
  try {
    if (await repo.getUserByUsername(parsed.data)) {
      return { fieldErrors: { username: "Questo username è già preso." }, values };
    }
    const user = await repo.createUser({ username: parsed.data, displayName: parsed.data, email: null, passwordHash: null });
    await createSession(user.id, GUEST_SESSION_TTL_MS);
  } catch (err) {
    console.error("startAsGuest failed", err);
    return { error: "Non siamo riusciti a iniziare. Riprova tra un momento.", values };
  }
  redirect("/welcome");
}

const completeSchema = registerSchema.omit({ username: true });

/** A guest registers: same account, same saves, now with email and password. */
export async function completeRegistration(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData);
  const values = { email: String(raw.email ?? ""), displayName: String(raw.displayName ?? "") };
  const viewer = await getOptionalUser();
  if (!viewer || !isGuest(viewer)) redirect(viewer ? "/home" : "/register");
  const parsed = completeSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const repo = getRepository();
  try {
    if (await repo.getCredentialsByEmail(parsed.data.email)) {
      return { fieldErrors: { email: "Esiste già un account con questa email. Prova ad accedere." }, values };
    }
    await repo.completeRegistration(viewer.id, {
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
    });
    // Swap the year-long guest session for a regular one.
    await destroySession();
    await createSession(viewer.id);
  } catch (err) {
    console.error("completeRegistration failed", err);
    return { error: "Non siamo riusciti a completare la registrazione. Riprova tra un momento.", values };
  }
  redirect("/home");
}

export async function register(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const raw = Object.fromEntries(formData);
  const values = { email: String(raw.email ?? ""), username: String(raw.username ?? ""), displayName: String(raw.displayName ?? "") };
  const parsed = registerSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const repo = getRepository();
  try {
    if (await repo.getCredentialsByEmail(parsed.data.email)) {
      return { fieldErrors: { email: "Esiste già un account con questa email. Prova ad accedere." }, values };
    }
    if (await repo.getUserByUsername(parsed.data.username)) {
      return { fieldErrors: { username: "Questo username è già preso." }, values };
    }
    const user = await repo.createUser({
      username: parsed.data.username,
      displayName: parsed.data.displayName,
      email: parsed.data.email,
      passwordHash: await hashPassword(parsed.data.password),
    });
    await createSession(user.id);
  } catch (err) {
    console.error("register failed", err);
    return { error: "Non siamo riusciti a creare l'account. Riprova tra un momento.", values };
  }
  // First access: pick a few series so recommendations have somewhere to start.
  redirect("/welcome");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

function fieldErrors(error: z.ZodError): AuthFormState["fieldErrors"] {
  const out: AuthFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof NonNullable<AuthFormState["fieldErrors"]>;
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Only allow same-site relative redirects after login. */
function safeRedirect(value: FormDataEntryValue | null): string {
  const s = typeof value === "string" ? value : "";
  return s.startsWith("/") && !s.startsWith("//") ? s : "/home";
}
