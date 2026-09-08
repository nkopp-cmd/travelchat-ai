import { build } from "esbuild";
import { access } from "node:fs/promises";

// The frontend is maintained independently; do not hide its build failures.
let hasWebBuild = false;
try { await access(new URL("./build-web.mjs", import.meta.url)); hasWebBuild = true; }
catch (error) { if (error.code !== "ENOENT") throw error; }
if (hasWebBuild) await import("./build-web.mjs");

await build({
  entryPoints: ["src/index.ts"], outfile: "dist/worker.mjs",
  bundle: true, format: "esm", platform: "neutral", target: "es2022",
  conditions: ["workerd", "worker", "browser"], external: ["node:*", "cloudflare:*"],
  minify: true, legalComments: "eof",
});
