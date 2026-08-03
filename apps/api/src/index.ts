import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
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

const app = new Hono<AppEnv>();

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

// Local photo storage. Swap for S3 (or any signed-URL store) in production —
// claim photos are evidence and shouldn't live on an app server's disk.
app.use("/uploads/*", serveStatic({ root: `./${env.UPLOAD_DIR.replace(/^\.\//, "")}/..` }));

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

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`\n  Warranted API → http://localhost:${info.port}`);
  console.log(`  Triage: ${aiEnabled ? "enabled" : "disabled (set ANTHROPIC_API_KEY)"}\n`);
});

export type App = typeof app;
