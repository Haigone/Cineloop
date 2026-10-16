import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { OAuthProvider, User } from "@/domain/types";
import type { Repository } from "@/server/data/repository";

/**
 * Sign in with Google or Discord (OAuth 2.0 authorization code + PKCE), with
 * no extra library. A provider shows up only when its client id and secret
 * are set, so nothing changes until they are configured:
 *
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
 *   DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET
 *
 * The callback URL to register with each provider is
 * `<site>/api/auth/<provider>/callback`.
 */

export const OAUTH_PROVIDERS: readonly OAuthProvider[] = ["google", "discord"];

/** Short-lived cookie holding state, PKCE verifier and where to go after, between the redirect and the callback. */
export const OAUTH_COOKIE = "cineloop_oauth";
export const OAUTH_COOKIE_MAX_AGE = 10 * 60;

/** What CineLoop needs from the outside account. `email` is set only when the provider says it is verified. */
export interface OAuthProfile {
  provider: OAuthProvider;
  id: string;
  email: string | null;
  name: string;
}

interface ProviderConfig {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  extraParams?: Record<string, string>;
  fetchProfile(accessToken: string): Promise<OAuthProfile>;
}

const CONFIG: Record<OAuthProvider, ProviderConfig> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    extraParams: { prompt: "select_account" },
    async fetchProfile(accessToken) {
      const p = await getJson<{ sub: string; email?: string; email_verified?: boolean; name?: string; given_name?: string }>(
        "https://openidconnect.googleapis.com/v1/userinfo",
        accessToken,
      );
      return { provider: "google", id: p.sub, email: p.email && p.email_verified ? p.email : null, name: p.name || p.given_name || "" };
    },
  },
  discord: {
    authorizeUrl: "https://discord.com/oauth2/authorize",
    tokenUrl: "https://discord.com/api/oauth2/token",
    scope: "identify email",
    extraParams: { prompt: "none" },
    async fetchProfile(accessToken) {
      const p = await getJson<{ id: string; username: string; global_name?: string | null; email?: string | null; verified?: boolean }>(
        "https://discord.com/api/users/@me",
        accessToken,
      );
      return { provider: "discord", id: p.id, email: p.email && p.verified ? p.email : null, name: p.global_name || p.username };
    },
  },
};

function credentials(provider: OAuthProvider) {
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function isOAuthProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** The providers whose keys are set: only these get a button. */
export function configuredOAuthProviders(): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((p) => credentials(p) !== null);
}

/** Where the provider sends the browser back. APP_URL wins over the request's own origin (useful behind proxies). */
export function callbackUrl(provider: OAuthProvider, requestOrigin: string): string {
  const base = (process.env.APP_URL || requestOrigin).replace(/\/+$/, "");
  return `${base}/api/auth/${provider}/callback`;
}

export function newOAuthState() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  return { state, verifier };
}

export function authorizeUrl(provider: OAuthProvider, redirectUri: string, state: string, verifier: string): string | null {
  const creds = credentials(provider);
  if (!creds) return null;
  const c = CONFIG[provider];
  const url = new URL(c.authorizeUrl);
  url.search = new URLSearchParams({
    client_id: creds.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: c.scope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    ...c.extraParams,
  }).toString();
  return url.toString();
}

/** Trades the one-time code for the account's profile. Throws on any provider error. */
export async function fetchOAuthProfile(provider: OAuthProvider, code: string, redirectUri: string, verifier: string): Promise<OAuthProfile> {
  const creds = credentials(provider);
  if (!creds) throw new Error(`${provider} sign-in is not configured`);
  const c = CONFIG[provider];
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`${provider} token exchange failed: ${res.status} ${await res.text().catch(() => "")}`);
  const { access_token } = (await res.json()) as { access_token?: string };
  if (!access_token) throw new Error(`${provider} returned no access token`);
  return c.fetchProfile(access_token);
}

async function getJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`profile request failed: ${res.status}`);
  return (await res.json()) as T;
}

export type OAuthOutcome =
  | { ok: true; user: User; created: boolean }
  | { ok: false; reason: "no_email" | "linked_elsewhere" };

/**
 * Finds or makes the CineLoop account for an outside account:
 * 1. already linked → that account (unless a registered account is linking it: then it stays where it is);
 * 2. someone signed in (a guest too) → linked to them, so nothing they saved is lost;
 * 3. an account with the same verified email → linked to it;
 * 4. otherwise a new account, with a username made from the name or email.
 * A new account needs a verified email, so it is never a guest by mistake.
 */
export async function resolveOAuthUser(repo: Repository, profile: OAuthProfile, viewer: User | null): Promise<OAuthOutcome> {
  const linked = await repo.getUserByOAuth(profile.provider, profile.id);
  if (linked) {
    // A registered account never gets swapped for another from Impostazioni; a guest just switches to it.
    if (viewer && viewer.id !== linked.id && viewer.email !== null) return { ok: false, reason: "linked_elsewhere" };
    return { ok: true, user: linked, created: false };
  }

  if (viewer) {
    await repo.linkOAuthAccount(viewer.id, profile.provider, profile.id);
    let user = viewer;
    if (viewer.email === null && profile.email && !(await repo.getUserByEmail(profile.email))) {
      user = await repo.setUserEmail(viewer.id, profile.email);
    }
    return { ok: true, user, created: false };
  }

  if (!profile.email) return { ok: false, reason: "no_email" };

  const sameEmail = await repo.getUserByEmail(profile.email);
  if (sameEmail) {
    await repo.linkOAuthAccount(sameEmail.id, profile.provider, profile.id);
    return { ok: true, user: sameEmail, created: false };
  }

  const username = await freeUsername(repo, profile);
  const displayName = (profile.name.trim() || username).slice(0, 48);
  const user = await repo.createUser({ username, displayName, email: profile.email, passwordHash: null });
  await repo.linkOAuthAccount(user.id, profile.provider, profile.id);
  return { ok: true, user, created: true };
}

/** A free username in the usual format (3–20 of a-z, 0-9, _), from the name or the email. */
async function freeUsername(repo: Repository, profile: OAuthProfile): Promise<string> {
  const fromName = slug(profile.name);
  const fromEmail = slug(profile.email?.split("@")[0] ?? "");
  let base = (fromName.length >= 3 ? fromName : fromEmail.length >= 3 ? fromEmail : "utente").slice(0, 16);
  base = base.replace(/_+$/, "") || "utente";
  if (base.length < 3) base = `${base}___`.slice(0, 3);
  if (!(await repo.getUserByUsername(base))) return base;
  for (let i = 0; i < 50; i++) {
    const candidate = `${base}${Math.floor(Math.random() * 9000) + 1000}`;
    if (!(await repo.getUserByUsername(candidate))) return candidate;
  }
  return `u_${randomBytes(6).toString("hex")}`;
}

function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}
