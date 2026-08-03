/** Drop and recreate the public schema, then re-run migrations. Dev only. */

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { env } from "../env.js";
import { db, pool } from "./index.js";

async function main() {
  if (env.NODE_ENV === "production") {
    console.error("Refusing to reset the database in production.");
    process.exit(1);
  }

  console.log("Dropping public schema…");
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);

  /*
   * Drizzle records applied migrations in `drizzle.__drizzle_migrations`, not
   * in `public`. Dropping only `public` leaves that journal intact, so the
   * migrate call below sees every migration as already applied, creates
   * nothing, and reports success — leaving an empty database that fails on
   * the first insert instead of at reset time.
   */
  await db.execute(sql`drop schema if exists drizzle cascade`);

  console.log("Re-running migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });

  console.log("Reset complete. Run `pnpm db:seed` to reload demo data.");
  await pool.end();
}

main().catch(async (error) => {
  console.error("Reset failed:", error);
  await pool.end();
  process.exit(1);
});
