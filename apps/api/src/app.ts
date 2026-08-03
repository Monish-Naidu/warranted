/**
 * The Hono application, with no server attached.
 *
 * Kept separate from `index.ts` so the same app can be served two ways: by
 * `@hono/node-server` locally (see `index.ts`) and by a Vercel serverless
 * function (see `/api/index.ts` at the repo root). Anything that assumes a
 * long-lived process or a writable disk belongs in `index.ts`, not here.
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ZodError } from "zod";
import { aiEnabled, env } from "./env.js";
import { authRoutes } from "./routes/auth.js";
import { builderRoutes } from "./routes/builder.js";
import { claimRoutes } from "./routes/claims.js";
import { homeRoutes } from "./routes/homes.js";
import type { AppEnv } from "./middleware/auth.js";

export const app = new Hono<AppEnv>();

app.use("*", logger());
app.use(
  "*",
  cors({
    // The mobile app has no fixed origin, so allow it through in development.
    origin: (origin) =>
      env.NODE_ENV === "development" ? (origin ?? "*") : env.WEB_ORIGIN,
    credentials: true,
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "warranted-api",
    triage: aiEnabled ? "enabled" : "disabled (no ANTHROPIC_API_KEY)",
  }),
);

app.route("/api/auth", authRoutes);
app.route("/api/homes", homeRoutes);
app.route("/api/claims", claimRoutes);
app.route("/api/builder", builderRoutes);

app.onError((error, c) => {
  if (error instanceof ZodError) {
    return c.json(
      {
        error: {
          code: "validation_failed",
          message: "The request body didn't validate.",
          details: error.flatten(),
        },
      },
      400,
    );
  }

  console.error("Unhandled error:", error);
  return c.json(
    {
      error: {
        code: "internal_error",
        message:
          env.NODE_ENV === "development" ? error.message : "Something went wrong.",
      },
    },
    500,
  );
});

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "No such endpoint." } }, 404),
);

export type App = typeof app;
