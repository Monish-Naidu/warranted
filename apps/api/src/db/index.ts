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
});

export const db = drizzle(pool, { schema });

export type Database = typeof db;
export { schema };
