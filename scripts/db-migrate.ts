/**
 * Applies pending SQL migrations from ./drizzle.
 * Usage: DATABASE_URL=postgres://… npm run db:migrate
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
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
