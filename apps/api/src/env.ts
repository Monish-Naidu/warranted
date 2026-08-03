import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required — see .env.example"),
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

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(`\nInvalid environment:\n${issues}\n`);
  console.error("Copy apps/api/.env.example to apps/api/.env and fill it in.\n");
  process.exit(1);
}

export const env = parsed.data;
export const aiEnabled = Boolean(env.ANTHROPIC_API_KEY);
