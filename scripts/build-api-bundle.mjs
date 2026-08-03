/**
 * Pre-bundle the API for the Vercel function.
 *
 * Why this exists: `packages/shared` and `packages/warranty` ship raw
 * TypeScript — their package.json `exports` point at `./src/index.ts`, which
 * is correct for every other consumer here (tsx, vite, vitest, drizzle-kit)
 * and is a convention CLAUDE.md asks us not to change. Vercel's function
 * builder compiles those files to `.js` but copies each package.json
 * verbatim, so at runtime Node resolves `@warranted/shared` to a `./src/
 * index.ts` that no longer exists in the deployment and the function dies on
 * import.
 *
 * So we inline exactly those two packages and nothing else. Every real npm
 * dependency stays external and is resolved from `apps/api/node_modules` the
 * way Vercel's tracer already handles correctly — keeping this bundle small
 * and leaving native/optional deps (pg's, in particular) untouched.
 */

import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const apiPkg = JSON.parse(
  await readFile(resolve(root, "apps/api/package.json"), "utf8"),
);

// Everything the API declares as a dependency stays external — except the
// workspace packages, which are the whole reason we're bundling.
const external = Object.keys(apiPkg.dependencies ?? {}).filter(
  (name) => !name.startsWith("@warranted/"),
);

/*
 * CommonJS, with an explicit `.cjs` extension, and both parts matter.
 *
 * Vercel compiles the `api/index.ts` entry to CJS because the repo root
 * package.json declares no `type`. `apps/api/package.json` does declare
 * `"type": "module"`, so anything named `.js` under that directory is treated
 * as ESM no matter what it contains — and a CJS entry requiring it dies at
 * runtime with ERR_REQUIRE_ESM. `.cjs` pins the format at the file level and
 * takes the ambient `type` out of the argument entirely.
 */
const outfile = resolve(root, "apps/api/dist/app.bundle.cjs");

const result = await build({
  entryPoints: [resolve(root, "apps/api/src/app.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  sourcemap: true,
  external,
  logLevel: "info",
});

if (result.errors.length > 0) process.exit(1);

// The bundle is generated, so there is no source for TypeScript to look at
// when `api/index.ts` imports it. This is the whole of its public surface —
// `handle()` needs nothing but `fetch`.
await writeFile(
  resolve(root, "apps/api/dist/app.bundle.d.cts"),
  [
    "import type { Hono } from \"hono\";",
    "",
    "export declare const app: Hono<any, any, any>;",
    "",
  ].join("\n"),
);

console.log(`  API bundle → apps/api/dist/app.bundle.cjs`);
console.log(`  external: ${external.join(", ")}`);
