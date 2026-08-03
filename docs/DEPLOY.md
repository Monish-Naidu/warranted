# Deploying to Vercel

One Vercel project serves both halves: the Vite SPA as static output, and the
whole Hono API as a single serverless function.

```
GET /                  → apps/web/dist/index.html   (SPA, client-routed)
GET /assets/*          → apps/web/dist/assets/*     (static, hashed)
ANY /api/*, /health    → api/index.ts               (one function, Hono routes)
```

`vercel.json` holds the build command, the output directory, and those
rewrites. Rewrites run after the filesystem check, so hashed assets are served
directly and only unmatched paths fall through to `index.html`.

## Why the API is pre-bundled

`api/index.ts` imports `apps/api/dist/app.bundle.js`, which the build
generates — it does **not** import `apps/api/src/app.ts` directly.

`packages/shared` and `packages/warranty` ship raw TypeScript: their
package.json `exports` point at `./src/index.ts`. That is correct for every
other consumer in this repo (tsx, vite, vitest, drizzle-kit) and is a
convention CLAUDE.md asks us not to change. But Vercel's function builder
compiles those files to `.js` while copying each package.json verbatim, so at
runtime Node resolves `@warranted/shared` to a `./src/index.ts` that no longer
exists in the deployment, and the function dies on import.

`scripts/build-api-bundle.mjs` inlines exactly those two workspace packages
with esbuild and leaves every real npm dependency external, so Vercel's
dependency tracer keeps handling `pg`, `drizzle-orm`, `jose` and friends the
way it already does correctly.

## First-time setup

### 1. Provision Postgres

The bundled `embedded-postgres` used by `pnpm db:local` is a development
convenience and cannot run on Vercel. Use any hosted Postgres — Neon's free
tier through the Vercel Marketplace is the least friction, and its **pooled**
connection string is the one you want.

### 2. Set environment variables

Add these to the Vercel project (Settings → Environment Variables, or
`vercel env add <NAME> production`). Never commit them.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | Your hosted Postgres connection string |
| `JWT_SECRET` | 32+ random chars — `openssl rand -base64 48` |
| `DB_POOL_MAX` | `1` — see below |
| `WEB_ORIGIN` | The deployment's own origin, e.g. `https://warranted.vercel.app` |
| `GEMINI_API_KEY` | A model provider. Free tier at https://aistudio.google.com/apikey. Takes priority when both are set. |
| `ANTHROPIC_API_KEY` | The other provider, paid. Either one is enough; with neither, claims are accepted but arrive untriaged and document extraction falls back to manual entry. |
| `NODEJS_HELPERS` | `0`, and not optional. See `api/index.ts` — without it every request carrying a body hangs. |

`DB_POOL_MAX=1` matters. Each warm serverless instance builds its own `pg`
pool, so the local default of 10 multiplies by the number of concurrent
instances and will exhaust a hosted Postgres's connection limit. Keep the pool
at 1 per instance and let the database's own pooler do the pooling.

### 3. Migrate and seed

Run against the hosted database from your machine — there is no migration step
in the deploy:

```bash
DATABASE_URL='<your connection string>' pnpm db:migrate
DATABASE_URL='<your connection string>' pnpm db:seed
```

### 4. Deploy

```bash
vercel deploy          # preview
vercel deploy --prod   # production
```

Pushes to `main` also deploy, since the project is linked to the GitHub repo.

## Verifying a deployment

```bash
curl https://<deployment>/health
# {"ok":true,"service":"warranted-api","triage":"..."}
```

Then sign in through the portal. If `/health` answers but sign-in returns a
500, the function is running and the database connection is the problem.

## Known limitation: photo upload is broken in this deployment

Claim photos are written to local disk (`UPLOAD_DIR`). Vercel's filesystem is
read-only, so `POST /api/claims/:id/photos` will fail, and `/uploads/*` is not
mounted on the serverless app at all — it stays in `apps/api/src/index.ts`,
which only the self-hosted server uses.

Everything else works: auth, exposure, claims, triage, determinations,
backcharges, the scorecard, and plan patterns.

Fixing it means moving photo storage to object storage with signed URLs, which
is already on `docs/ROADMAP.md` and is the right change regardless of host —
claim photos are evidence and do not belong on an app server's disk.
