// maplibre-gl 6 resolves its web worker next to its own module URL. Bundled into a Next chunk that file does not
// exist, so copy the worker to public/ under a versioned name; spot-pin-map points setWorkerUrl at it.
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("maplibre-gl/package.json"));
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
mkdirSync("public/vendor", { recursive: true });
copyFileSync(join(root, "dist/maplibre-gl-worker.mjs"), `public/vendor/maplibre-gl-worker-${version}.mjs`);
console.log(`maplibre worker ${version} -> public/vendor`);
