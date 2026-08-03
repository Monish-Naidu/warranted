/**
 * A real Postgres server for local development, with nothing to install.
 *
 * This bundles the actual Postgres binaries and runs them against a data
 * directory inside the repo. It is genuine Postgres — same SQL, same driver,
 * same migrations — so nothing about the app changes between this and a
 * Homebrew or hosted install. It exists so a fresh clone runs immediately.
 *
 * For a Homebrew or hosted Postgres, skip this entirely: point DATABASE_URL at
 * that server and run `pnpm db:migrate` directly.
 *
 * Usage:
 *   pnpm db:local          start (runs in the foreground; Ctrl-C to stop)
 *   pnpm db:local --reset  wipe the data directory first
 */

import EmbeddedPostgres from "embedded-postgres";
import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(here, "../../.postgres");
const PORT = 5432;
const USER = "warranted";
const PASSWORD = "warranted";
const DATABASE = "warranted";

async function main() {
  const reset = process.argv.includes("--reset");

  if (reset) {
    console.log("Removing existing data directory…");
    await rm(DATA_DIR, { recursive: true, force: true });
  }

  await mkdir(DATA_DIR, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  console.log("Starting Postgres…");
  try {
    await pg.initialise();
  } catch {
    // Already initialised — that's the normal case on a restart.
  }
  await pg.start();

  try {
    await pg.createDatabase(DATABASE);
    console.log(`Created database "${DATABASE}".`);
  } catch {
    // Already exists.
  }

  const url = `postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}`;
  console.log(`
Postgres is running.

  DATABASE_URL=${url}

Leave this running. In another terminal:

  pnpm db:migrate
  pnpm db:seed
  pnpm dev

Ctrl-C to stop.
`);

  const shutdown = async () => {
    console.log("\nStopping Postgres…");
    await pg.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Hold the process open.
  await new Promise(() => {});
}

main().catch((error) => {
  console.error("Failed to start local Postgres:", error);
  process.exit(1);
});
