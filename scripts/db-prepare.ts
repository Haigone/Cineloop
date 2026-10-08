/**
 * Gets a database ready to serve: applies pending migrations, then makes sure
 * the catalog has titles so search and "Esplora" are never empty.
 *
 * `npm run build` runs this with --if-configured, so a deploy with a database
 * is self-setting-up and a build without one (in-memory demo) skips it.
 * It never touches user data.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { SEED_TITLES } from "@/server/data/seed/catalog";
import { titleToRow } from "@/server/data/postgres/postgres-repository";
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

  for (const row of SEED_TITLES.map(titleToRow)) {
    await db.insert(schema.titles).values(row).onConflictDoUpdate({ target: schema.titles.id, set: row });
  }
  const [count] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.titles);
  console.log(`Catalog ready: ${count?.n ?? 0} titles.`);

  await client.end();
}

main(url).catch((err) => {
  console.error(err);
  process.exit(1);
});
