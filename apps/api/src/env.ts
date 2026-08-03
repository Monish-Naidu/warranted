import { config } from "dotenv";
import { z } from "zod";

config();

/*
 * Vercel's Postgres integrations (Neon and friends) inject `POSTGRES_URL`,
 * and some inject `DATABASE_URL` as well — which one you get depends on the
 * provider. Accepting either means attaching a database in the Vercel
 * dashboard is sufficient, with no second variable to copy by hand.
 * `DATABASE_URL` wins when both are present.
 */
const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL (or POSTGRES_URL) is required — see .env.example"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 chars — run: openssl rand -base64 48"),
  PORT: z.coerce.number().int().positive().default(3001),
  /** Per-process Postgres pool size. Drop to 1 on serverless — see db/index.ts. */
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  /** Optional. Without it, claims are accepted but arrive untriaged. */
  ANTHROPIC_API_KEY: z.string().optional(),
  UPLOAD_DIR: z.string().default("./uploads"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

const parsed = envSchema.safeParse({ ...process.env, DATABASE_URL: databaseUrl });

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  const message = `Invalid environment:\n${issues}`;

  console.error(`\n${message}\n`);
  console.error("Copy apps/api/.env.example to apps/api/.env and fill it in.\n");

  /*
   * Throw rather than `process.exit(1)`. On a long-lived server the two are
   * equivalent — the process dies either way, after printing the same
   * message. In a serverless function they are not: exiting at import time
   * kills the invocation with no trace, so a missing variable surfaces to the
   * client as a bare 500 and to the operator as an empty log. The throw puts
   * the actual reason in the platform's error log.
   */
  throw new Error(message);
}

export const env = parsed.data;
export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
