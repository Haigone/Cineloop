import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getRepository } from "@/server/data";

/**
 * Database-backed sessions. The browser holds a random 256-bit token in an
 * httpOnly cookie; only its SHA-256 hash is stored, so a leaked sessions table
 * cannot be replayed.
 */

export const SESSION_COOKIE = "cineloop_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await getRepository().createSession({ tokenHash: hashToken(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** Returns the user id for the current request's session, or null. */
export async function readSessionUserId(): Promise<string | null> {
  // Session checks compare against the clock, so they always run per request.
  await connection();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await getRepository().getSession(hashToken(token));
  if (!session || session.expiresAt.getTime() < Date.now()) return null;
  return session.userId;
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await getRepository().deleteSession(hashToken(token));
  jar.delete(SESSION_COOKIE);
}

/** Hash of the current request's session token, used to keep it alive when others are revoked. */
export async function currentSessionHash(): Promise<string | undefined> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : undefined;
}
