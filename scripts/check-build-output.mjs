/**
 * Guard the one build setting that silently breaks every write path.
 *
 * With Vercel's Node helpers enabled, the launcher drains the request body
 * before the Hono adapter can read it, and every request carrying a body hangs
 * until the platform kills it. GETs are unaffected, so the deployment looks
 * healthy while login, claim submission, and file upload all time out with
 * nothing in the log.
 *
 * The flag is build-time and environment-only (`NODEJS_HELPERS=0`), so nothing
 * in the source tree records it and a fresh project or a cleared environment
 * variable brings the bug straight back. This asserts on the built artifact.
 */

import { readFile } from "node:fs/promises";

const CONFIG = ".vercel/output/functions/api/index.func/.vc-config.json";

let config;
try {
  config = JSON.parse(await readFile(CONFIG, "utf8"));
} catch {
  console.error(`No built function at ${CONFIG}. Run \`vercel build\` first.`);
  process.exit(1);
}

if (config.shouldAddHelpers !== false) {
  console.error(
    [
      "",
      "  The built function has Vercel's Node body helpers ENABLED.",
      "",
      "  Every request with a body will hang for the full function duration:",
      "  login, claim submission, determinations, file upload. GETs will look",
      "  fine, so the deployment will appear healthy.",
      "",
      "  Fix: set NODEJS_HELPERS=0 on the Vercel project, for every environment",
      "  it builds in, then redeploy. It is read at build time.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

console.log("build output ok: Node body helpers are disabled");
