import { describe, expect, it } from "vitest";
import { MemoryRepository } from "@/server/data/memory-repository";
import { authorizeUrl, callbackUrl, configuredOAuthProviders, resolveOAuthUser, type OAuthProfile } from "@/server/auth/oauth";
import { isGuest } from "@/domain/types";

const google = (over: Partial<OAuthProfile> = {}): OAuthProfile => ({ provider: "google", id: "g-1", email: "Giulia.Rossi@gmail.com", name: "Giulia Rossi", ...over });

describe("Google / Discord sign-in", () => {
  it("creates a registered account with a free username, then signs back into it", async () => {
    const repo = new MemoryRepository();
    const first = await resolveOAuthUser(repo, google(), null);
    expect(first).toMatchObject({ ok: true, created: true });
    if (!first.ok) return;
    expect(first.user).toMatchObject({ username: "giulia_rossi", displayName: "Giulia Rossi", email: "giulia.rossi@gmail.com" });
    expect(isGuest(first.user)).toBe(false);
    expect(await repo.getPasswordHash(first.user.id)).toBeNull();

    const again = await resolveOAuthUser(repo, google(), null);
    expect(again).toMatchObject({ ok: true, created: false, user: { id: first.user.id } });
    expect(await repo.listOAuthProviders(first.user.id)).toEqual(["google"]);
  });

  it("picks another username when the natural one is taken", async () => {
    const repo = new MemoryRepository();
    await repo.createUser({ username: "giulia_rossi", displayName: "Altra", email: "altra@x.it", passwordHash: "h" });
    const out = await resolveOAuthUser(repo, google(), null);
    expect(out.ok && out.user.username).toMatch(/^giulia_rossi\d{4}$/);
  });

  it("links to the existing account with the same verified email", async () => {
    const repo = new MemoryRepository();
    const existing = await repo.createUser({ username: "giulia", displayName: "Giulia", email: "giulia.rossi@gmail.com", passwordHash: "h" });
    const out = await resolveOAuthUser(repo, google(), null);
    expect(out).toMatchObject({ ok: true, created: false, user: { id: existing.id } });
  });

  it("refuses to create an account without a verified email", async () => {
    const repo = new MemoryRepository();
    expect(await resolveOAuthUser(repo, { provider: "discord", id: "d-1", email: null, name: "x" }, null)).toEqual({ ok: false, reason: "no_email" });
  });

  it("keeps a guest's account and registers it with the provider's email", async () => {
    const repo = new MemoryRepository();
    const guest = await repo.createUser({ username: "ospite", displayName: "ospite", email: null, passwordHash: null });
    const out = await resolveOAuthUser(repo, { provider: "discord", id: "d-2", email: "o@x.it", name: "Ospite" }, guest);
    expect(out).toMatchObject({ ok: true, created: false, user: { id: guest.id, username: "ospite", email: "o@x.it" } });
    expect(await repo.listOAuthProviders(guest.id)).toEqual(["discord"]);
  });

  it("never moves an outside account already linked to someone else onto a registered account", async () => {
    const repo = new MemoryRepository();
    const first = await resolveOAuthUser(repo, google(), null);
    const other = await repo.createUser({ username: "altro", displayName: "Altro", email: "altro@x.it", passwordHash: "h" });
    expect(await resolveOAuthUser(repo, google(), other)).toEqual({ ok: false, reason: "linked_elsewhere" });
    expect(first.ok && (await repo.getUserByOAuth("google", "g-1"))?.id).toBe(first.ok && first.user.id);
  });

  it("offers a provider only when its keys are set, and sends PKCE", () => {
    delete process.env.DISCORD_CLIENT_ID;
    process.env.GOOGLE_CLIENT_ID = "cid";
    process.env.GOOGLE_CLIENT_SECRET = "secret";
    expect(configuredOAuthProviders()).toEqual(["google"]);
    expect(authorizeUrl("discord", "x", "s", "v")).toBeNull();
    const url = new URL(authorizeUrl("google", callbackUrl("google", "https://cineloop.example/"), "st", "verifier")!);
    expect(url.searchParams.get("redirect_uri")).toBe("https://cineloop.example/api/auth/google/callback");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.toString()).not.toContain("secret");
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GOOGLE_CLIENT_SECRET;
  });
});
