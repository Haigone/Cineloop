/**
 * Applies pending SQL migrations from ./drizzle.
 * Usage: DATABASE_URL=postgres://… npm run db:migrate
 *
 * `npm run build` calls this with --if-configured, so a deploy with a
 * database always has an up-to-date schema, and a build without one (the
 * in-memory demo) simply skips it.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  if (process.argv.includes("--if-configured")) {
    console.log("DATABASE_URL is not set: skipping migrations (in-memory demo mode).");
    process.exit(0);
  }
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

async function main(databaseUrl: string) {
  const client = postgres(databaseUrl, { max: 1 });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Migrations applied.");
}

main(url).catch((err) => {
  console.error(err);
  process.exit(1);
});
