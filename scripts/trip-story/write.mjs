#!/usr/bin/env node
// Trip-story plan T3: write one blog post from one exported trip (scripts/trip-story/export.mjs --out DIR).
//   node scripts/trip-story/write.mjs <trip.json> [--date YYYY-MM-DD] [--out DIR] [--dry-run]
// Runs on the ChatGPT SUBSCRIPTION via `codex exec` (runCodex of weekly-post-draft.mjs); nothing metered.
// Exit codes: 0 written, 2 the draft failed its checks twice, 3 a post for this trip (same cover image) exists.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BLOG_BUNDLE, BLOG_DIR, blogFiles, renderBundle } from "../blog-index.mjs";
import { runCodex } from "../weekly-post-draft.mjs";
import { buildPrompt, draftTripPost } from "./write-lib.mjs";

const args = process.argv.slice(2);
const value = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const input = args.find((a, i) => !a.startsWith("--") && !["--date", "--out"].includes(args[i - 1]));
if (!input) throw new Error("usage: write.mjs <trip.json> [--date YYYY-MM-DD] [--out DIR] [--dry-run]");
const date = value("--date") ?? new Date().toISOString().slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
const trip = JSON.parse(readFileSync(input, "utf8"));

if (args.includes("--dry-run")) {
  console.log(buildPrompt(trip, date));
  process.exit(0);
}
const existing = blogFiles(BLOG_DIR).find((f) => readFileSync(path.join(BLOG_DIR, f), "utf8").includes(`\nillustration: ${trip.cover}\n`));
if (existing) {
  console.error(`trip ${trip.itineraryId} already has a post: ${existing}`);
  process.exit(3);
}
const result = draftTripPost({ trip, date, generate: runCodex, log: (l) => console.error(l) });
if (!result.ok) {
  console.error(`no post for ${trip.itineraryId}: ${result.reason}`);
  process.exit(2);
}
const out = value("--out");
writeFileSync(path.join(out ?? BLOG_DIR, result.file), result.source);
if (!out) writeFileSync(BLOG_BUNDLE, renderBundle());
console.log(path.join(out ?? "content/blog", result.file));
