import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "tailwindcss";
import loadConfig from "tailwindcss/loadConfig.js";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import assert from "node:assert/strict";

const root = fileURLToPath(new URL("../../", import.meta.url));
export const assetsDirectory = join(root, "test-results/better-auth-integration/assets");
await mkdir(join(assetsDirectory, "assets"), { recursive: true });
const bundle = await build({ absWorkingDir: root, entryPoints: ["scripts/better-auth-integration/app.tsx"],
  outfile: join(assetsDirectory, "assets/app.js"), bundle: true, format: "esm", platform: "browser",
  target: "es2022", jsx: "automatic", alias: { "@": root },
  define: { "process.env.NODE_ENV": '"production"', "process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY": '""' },
  minify: true, legalComments: "eof", metafile: true });
const inputs = Object.keys(bundle.metafile.inputs);
for (const input of ["providers/better-auth-session-provider.tsx", "providers/app-session-provider.tsx",
  "components/spots/save-spot-button.tsx", "components/spots/spot-interactions.tsx", "components/ui/toaster.tsx",
  "components/itineraries/native-itinerary-editor.tsx", "components/itineraries/itinerary-editor.tsx",
  "components/itineraries/native-itinerary-collection.tsx", "components/itineraries/itinerary-collection.tsx",
  "hooks/use-saved-spot.ts", "node_modules/better-auth/dist/client/react/index.mjs"]) assert.ok(inputs.includes(input), input);
assert.equal(inputs.some((input) => /@clerk|providers\/index\.tsx|node_modules\/next\//.test(input)), false);
assert.equal(inputs.some((input) => /itinerary-list|nativeimages|itinerary-queries|supabase|react-query/.test(input)), false);
export const buildEvidence = { inputs, betterAuthVersion: JSON.parse(await readFile(join(root, "node_modules/better-auth/package.json"), "utf8")).version };
assert.equal(buildEvidence.betterAuthVersion, "1.7.3");
await writeFile(join(assetsDirectory, "../build-evidence.json"), JSON.stringify(buildEvidence, null, 2));
const config = loadConfig(join(root, "tailwind.config.ts"));
config.content = [join(root, "components/**/*.{ts,tsx}"), join(root, "scripts/better-auth-integration/app.tsx")];
const css = await postcss([tailwind(config)]).process(await readFile(join(root, "app/globals.css"), "utf8"),
  { from: join(root, "app/globals.css"), map: false });
await writeFile(join(assetsDirectory, "assets/app.css"), css.css + await readFile(new URL("fixture.css", import.meta.url), "utf8"));
await writeFile(join(assetsDirectory, "index.html"), '<!doctype html><html lang="en" class="dark"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Localley synthetic integration fixture</title><link rel="stylesheet" href="/assets/app.css"><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>');
