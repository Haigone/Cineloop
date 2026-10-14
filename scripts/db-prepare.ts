/**
 * Gets a database ready to serve: applies pending migrations, then makes sure
 * the catalog has titles so search and "Esplora" are never empty.
 *
 * `npm run build` runs this with --if-configured, so a deploy with a database
 * is self-setting-up and a build without one (in-memory demo) skips it.
 * User data is only touched to move what was saved on a duplicate title
 * (src/domain/duplicates.ts) onto the title kept in its place.
 */
import { inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { Title } from "@/domain/types";
import { TmdbCatalog } from "@/integrations/catalog/tmdb-catalog";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import { PostgresRepository, titleToRow } from "@/server/data/postgres/postgres-repository";
import { REPLACED_TITLES } from "@/domain/duplicates";
import * as schema from "@/server/data/postgres/schema";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.log("DATABASE_URL is not set: skipping database setup (in-memory demo mode).");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function main(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");

  const titles = await withArtwork(SEED_TITLES);
  for (const title of titles) {
    const row = titleToRow(title);
    // Without new artwork, keep whatever an earlier build found.
    const set = title.artwork.posterUrl ? row : { ...row, posterUrl: undefined, backdropUrl: undefined };
    await db.insert(schema.titles).values(row).onConflictDoUpdate({ target: schema.titles.id, set });
  }
  await retireDuplicates(db);
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.titles);
  console.log(`Catalog ready: ${count?.n ?? 0} titles.`);

  await client.end();
}

/**
 * Duplicates still cached go, and what anyone saved on them (lists, progress, ratings, groups) moves
 * to the title kept in their place. The kept title comes from the database, else from TMDB; without
 * either it waits for the next build (its page still moves it when opened).
 */
async function retireDuplicates(db: ConstructorParameters<typeof PostgresRepository>[0]) {
  const cached = await db.select({ id: schema.titles.id }).from(schema.titles).where(inArray(schema.titles.id, Object.keys(REPLACED_TITLES)));
  if (cached.length === 0) return;
  const repo = new PostgresRepository(db);
  const token = process.env.TMDB_READ_TOKEN;
  const tmdb = token ? new TmdbCatalog(token) : null;
  for (const { id } of cached) {
    const keep = REPLACED_TITLES[id]!;
    const [local] = await repo.getTitlesByIds([keep]);
    const kept = local ?? (await tmdb?.getTitle(keep).catch(() => null)) ?? null;
    if (!kept) {
      console.log(`Duplicate ${id} kept: ${keep} is not available yet.`);
      continue;
    }
    const { moved, merged } = await repo.replaceTitle(id, kept);
    console.log(`Duplicate ${id} moved to ${keep} (${moved} library entries moved, ${merged} merged).`);
  }
}

/**
 * The bundled titles ship without images. With a TMDB token, look each one up
 * (same name, type and year) and take its poster and backdrop.
 */
async function withArtwork(titles: readonly Title[]): Promise<Title[]> {
  const token = process.env.TMDB_READ_TOKEN;
  if (!token) {
    console.log("TMDB_READ_TOKEN is not set: catalog titles keep generated artwork.");
    return [...titles];
  }
  const tmdb = new TmdbCatalog(token);
  let found = 0;
  const out = await Promise.all(
    titles.map(async (t) => {
      const match = await tmdb.match(t).catch(() => null);
      if (!match?.artwork.posterUrl) return t;
      found += 1;
      return { ...t, artwork: { ...t.artwork, posterUrl: match.artwork.posterUrl, backdropUrl: match.artwork.backdropUrl } };
    }),
  );
  console.log(`Artwork from TMDB for ${found}/${titles.length} catalog titles.`);
  return out;
}

main(url).catch((err) => {
  console.error(err);
  process.exit(1);
});
