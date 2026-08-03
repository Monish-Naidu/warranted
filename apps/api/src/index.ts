/**
 * Local / self-hosted entrypoint: the Hono app behind a long-lived Node
 * server. The Vercel deployment does not use this file — see `/api/index.ts`
 * at the repo root.
 */

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { app } from "./app.js";
import { aiEnabled, env } from "./env.js";

// Local photo storage. Swap for S3 (or any signed-URL store) in production —
// claim photos are evidence and shouldn't live on an app server's disk. This
// is mounted here rather than in `app.ts` because a serverless deployment has
// no writable disk to serve from.
app.use(
  "/uploads/*",
  serveStatic({ root: `./${env.UPLOAD_DIR.replace(/^\.\//, "")}/..` }),
);

serve({ fetch: app.fetch, port: env.PORT }, (info) => {
  console.log(`\n  Warranted API → http://localhost:${info.port}`);
  console.log(`  Triage: ${aiEnabled ? "enabled" : "disabled (set ANTHROPIC_API_KEY)"}\n`);
});

export type { App } from "./app.js";
