import { rm } from "node:fs/promises";

// Only rebuildable package-local artifacts. Never touch parent state or node_modules.
for (const path of [".local", ".wrangler", ".npm-cache"]) await rm(new URL(`../${path}`, import.meta.url), { recursive: true, force: true });
