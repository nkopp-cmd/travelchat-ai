import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"], outfile: "dist/worker.mjs",
  bundle: true, format: "esm", platform: "neutral", target: "es2022",
  conditions: ["workerd", "worker", "browser"], external: ["node:*", "cloudflare:*"],
  minify: true, legalComments: "eof",
});
