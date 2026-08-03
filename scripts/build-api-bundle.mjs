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
import { readFile } from "node:fs/promises";
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

const result = await build({
  entryPoints: [resolve(root, "apps/api/src/app.ts")],
  outfile: resolve(root, "apps/api/dist/app.bundle.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  external,
  logLevel: "info",
});

if (result.errors.length > 0) process.exit(1);

console.log(`  API bundle → apps/api/dist/app.bundle.js`);
console.log(`  external: ${external.join(", ")}`);
