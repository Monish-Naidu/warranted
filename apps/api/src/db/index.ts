import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env.js";
import * as schema from "./schema.js";

/*
 * Pool size is environment-dependent. A long-lived server wants a real pool;
 * a serverless deployment gets one pool *per warm instance*, so the same 10
 * would multiply by the number of concurrent instances and exhaust a hosted
 * Postgres's connection limit. Set DB_POOL_MAX=1 there and put the pooling in
 * front of the database (Neon's pooled endpoint, PgBouncer, etc.).
 */
export const pool = new pg.Pool({
  connectionString: env.DATABASE_URL,
  max: env.DB_POOL_MAX,
  /*
   * pg defaults to waiting forever for a connection. On a serverless platform
   * that turns any network problem into an opaque function timeout with
   * nothing in the log — the failure looks identical to a slow query, and
   * there's no error to read. Ten seconds is far above a healthy connect
   * (single-digit ms same-region, tens cross-region) and far below the
   * function's own limit, so a real failure surfaces as a real error.
   */
  connectionTimeoutMillis: 10_000,
});

// A pool error with no listener is an unhandled 'error' event, which takes the
// whole process down. Serverless recycles instances constantly, so idle
// backends get closed underneath us as a matter of course.
pool.on("error", (error) => {
  console.error("Postgres pool error:", error);
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export { schema };
