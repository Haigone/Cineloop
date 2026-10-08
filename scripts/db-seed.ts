/**
 * Loads the demo catalog and demo people into PostgreSQL.
 * Usage: DATABASE_URL=postgres://… npm run db:seed [-- --reset]
 *
 * Without --reset it refuses to touch a database that already has users.
 * The catalog is always upserted, so it is safe to re-run after adding titles.
 */
import { sql } from "drizzle-orm";
import { hashPasswordSync } from "@/server/auth/password";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import { buildSeed, DEMO_EMAIL, DEMO_PASSWORD } from "@/server/data/seed/people";
import { createDb, titleToRow } from "@/server/data/postgres/postgres-repository";
import * as s from "@/server/data/postgres/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}
const reset = process.argv.includes("--reset");
const db = createDb(url);

async function main() {
  for (const row of SEED_TITLES.map(titleToRow)) {
    await db.insert(s.titles).values(row).onConflictDoUpdate({ target: s.titles.id, set: row });
  }
  console.log(`Catalog: ${SEED_TITLES.length} titles.`);

  const [{ count }] = (await db.execute(sql`select count(*)::int as count from users`)) as unknown as [{ count: number }];
  if (count > 0 && !reset) {
    console.log("Users already exist; skipping demo people. Re-run with --reset to replace all user data.");
    return;
  }

  const seed = buildSeed(new Date());
  const hash = hashPasswordSync(DEMO_PASSWORD);

  await db.transaction(async (tx) => {
    if (reset) await tx.execute(sql`truncate users, sessions, library_entries, wishlist_items, friendships, watch_events, activity, watch_parties, notifications, preferences cascade`);
    await tx.insert(s.users).values(seed.users.map((u) => ({ ...u, passwordHash: hash, createdAt: new Date(u.createdAt) })));
    await tx.insert(s.preferences).values(seed.preferences);
    await tx.insert(s.friendships).values(
      seed.friendships.map((f) => {
        const [userA, userB] = [f.a, f.b].sort() as [string, string];
        return { userA, userB, since: new Date(f.since) };
      }),
    );
    await tx.insert(s.libraryEntries).values(
      seed.library.map((e) => ({ ...e, addedAt: new Date(e.addedAt), lastWatchedAt: e.lastWatchedAt ? new Date(e.lastWatchedAt) : null })),
    );
    if (seed.wishlist.length) await tx.insert(s.wishlistItems).values(seed.wishlist.map((w) => ({ ...w, addedAt: new Date(w.addedAt) })));
    if (seed.watchEvents.length) await tx.insert(s.watchEvents).values(seed.watchEvents.map((e) => ({ ...e, watchedAt: new Date(e.watchedAt) })));
    if (seed.activity.length) await tx.insert(s.activity).values(seed.activity.map((a) => ({ ...a, at: new Date(a.at) })));
    const notes = [...seed.notifications].flatMap(([userId, list]) => list.map((n) => ({ ...n, userId, at: new Date(n.at) })));
    if (notes.length) await tx.insert(s.notifications).values(notes);
  });

  console.log(`Demo people: ${seed.users.length}. Sign in as ${DEMO_EMAIL} / ${DEMO_PASSWORD}.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
