import { describe, expect, it } from "vitest";
import { hashPassword, hashPasswordSync, verifyPassword } from "@/server/auth/password";
import { MemoryRepository } from "@/server/data/memory-repository";
import { DEMO_EMAIL } from "@/server/data/seed/people";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("una password lunga");
    expect(hash).not.toContain("una password lunga");
    expect(await verifyPassword("una password lunga", hash)).toBe(true);
    expect(await verifyPassword("una password lunghe", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
    expect(await verifyPassword("same-password", hashPasswordSync("same-password"))).toBe(true);
  });

  it("rejects malformed stored values instead of throwing", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  });
});

describe("MemoryRepository", () => {
  it("seeds a demo account that can sign in", async () => {
    const repo = new MemoryRepository();
    const creds = await repo.getCredentialsByEmail(DEMO_EMAIL.toUpperCase());
    expect(creds?.user.username).toBe("marco");
  });

  it("adds wishlist items on top and keeps positions contiguous", async () => {
    const repo = new MemoryRepository();
    const before = await repo.listWishlist("u_marco");
    const fresh = (await repo.listTitles()).find((t) => !before.some((w) => w.titleId === t.id))!;
    await repo.addToWishlist("u_marco", fresh.id);
    await repo.addToWishlist("u_marco", fresh.id);
    let list = await repo.listWishlist("u_marco");
    expect(list[0]!.titleId).toBe(fresh.id);
    expect(list).toHaveLength(before.length + 1);
    await repo.removeFromWishlist("u_marco", before[0]!.titleId);
    list = await repo.listWishlist("u_marco");
    expect(list.map((w) => w.position)).toEqual(list.map((_, i) => i));
  });

  it("keeps friendships symmetric", async () => {
    const repo = new MemoryRepository();
    const user = await repo.createUser({ username: "nuovo", displayName: "Nuovo", email: "n@x.it", passwordHash: "h" });
    await repo.addFriend(user.id, "u_marco");
    await repo.addFriend("u_marco", user.id);
    expect((await repo.listFriends(user.id)).map((f) => f.user.id)).toEqual(["u_marco"]);
    expect((await repo.listFriends("u_marco")).some((f) => f.user.id === user.id)).toBe(true);
    await repo.removeFriend("u_marco", user.id);
    expect(await repo.listFriends(user.id)).toEqual([]);
  });

  it("revokes other sessions but keeps the current one", async () => {
    const repo = new MemoryRepository();
    const expiresAt = new Date(Date.now() + 60_000);
    await repo.createSession({ tokenHash: "keep", userId: "u_marco", expiresAt });
    await repo.createSession({ tokenHash: "drop", userId: "u_marco", expiresAt });
    await repo.createSession({ tokenHash: "other", userId: "u_giulia", expiresAt });
    await repo.deleteUserSessions("u_marco", "keep");
    expect(await repo.getSession("keep")).not.toBeNull();
    expect(await repo.getSession("drop")).toBeNull();
    expect(await repo.getSession("other")).not.toBeNull();
  });
});
