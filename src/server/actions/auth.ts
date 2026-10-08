"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createSession, destroySession } from "@/server/auth/session";
import { getRepository } from "@/server/data";

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

const registerSchema = z.object({
  displayName: z.string().trim().min(2, "Usa almeno 2 caratteri.").max(48, "Massimo 48 caratteri."),
  username: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_]{3,20}$/, "3–20 caratteri: lettere, numeri o underscore."),
  email: z.string().trim().toLowerCase().email("Inserisci un indirizzo email valido."),
  password: z.string().min(10, "Usa almeno 10 caratteri.").max(128),
});

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
  redirect("/home");
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
