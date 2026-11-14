#!/usr/bin/env node
// Image library for story backgrounds and activity thumbnails (reach-engine R8, weekend-sprint L5).
//
//   node scripts/image-library/build.mjs jobs  --out DIR [--cities seoul,tokyo]   -> DIR/jobs.json for codex-image.py
//   python3 shared/scripts/codex-image.py DIR/jobs.json --out DIR                 -> DIR/<id>-<shape>.png (ChatGPT plan)
//   node scripts/image-library/build.mjs publish --out DIR [--dry-run]           -> R2 upload + lib/image-library.json
//
// Every image is a painted illustration of a mood or a category, never of a named venue or landmark, so a reader
// cannot take it for a photo of a real spot. Story images are JPEG (Satori renders no WebP), thumbnails WebP.
// Keys are content-addressed under the existing prefixes: legacy/<sha256>.jpg (read by the story renderer as
// /media/story/<sha>.jpg) and activity-thumbnails/<8 hex>.webp (served by /media/activity).
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = path.join(ROOT, "lib/image-library.json");
const BUCKET = "localley-legacy-media";
export const RING_1 = ["seoul", "tokyo", "bangkok", "singapore"];

const STYLE = "A painterly gouache travel-poster illustration with visible brush texture and soft muted colours; " +
  "clearly an illustration, not a photograph. Generic scenery only: no specific real landmark, shop or venue.";

// Mood words per city: what the place feels like, never a named building.
const CITY_FEEL = {
  seoul: "an East Asian megacity between granite mountains, low hanok-style tiled roofs beside modern towers, a wide river",
  tokyo: "a dense Japanese city of narrow lanes, small wooden houses beside glass towers, overhead power lines, trains",
  bangkok: "a humid Southeast Asian river city, gilded temple roof shapes, long-tail boats, tropical trees and canals",
  singapore: "a green tropical city-state, shophouse rows in pastel colours, lush trees, a calm harbour at the edge",
};

const MOOD = {
  skyline: "Wide view over the city at golden hour, layered rooftops fading into haze.",
  street: "A quiet residential side street in the morning, potted plants, bicycles, soft shadows.",
  food: "A busy food alley at dusk, steam rising from small stalls, warm lantern light, people as soft silhouettes.",
  night: "A rainy night street with glowing reflections on wet pavement, deep blues and warm window light.",
  cafe: "A small corner cafe interior by a window, a cup and a plant on a wooden table, city light outside.",
  nature: "A calm park or hillside path above the city, trees, a bench, the city far below in late light.",
};

const CATEGORY = {
  restaurant: "A simple table with shared dishes and chopsticks under a warm pendant lamp.",
  cafe: "A latte and a pastry on a small marble table beside a sunny window with a plant.",
  bar: "A dim cozy bar counter with a few glasses and warm bokeh lights, no bottles with labels.",
  market: "Colourful market stalls with fruit, vegetables and hanging lamps under a canvas awning.",
  temple: "A generic Asian temple courtyard with a tiled roof edge, a stone lantern and old trees.",
  park: "A green park path with trees, a bench and dappled sunlight.",
  museum: "A bright quiet gallery hall with abstract framed shapes on white walls and a wooden bench.",
  shopping: "A small boutique street with awnings, potted plants and shop windows without any lettering.",
  attraction: "A viewpoint terrace looking over a hazy city and hills at golden hour.",
  neighborhood: "A charming residential lane with low houses, hanging plants and a cat on a step.",
};

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) out[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
    else out._.push(a);
  }
  return out;
}

/** Story jobs (tall) for the given cities and generic activity jobs (square). Ids: story-<city>-<mood>, act-_-<cat>. */
export function buildJobs(cities = RING_1) {
  const jobs = [];
  for (const city of cities) {
    const feel = CITY_FEEL[city];
    if (!feel) throw new Error(`no mood text for ${city}`);
    for (const [mood, scene] of Object.entries(MOOD)) {
      jobs.push({ id: `story-${city}-${mood}`, prompt: `${STYLE} The feel of ${feel}. ${scene}`, formats: ["story"] });
    }
  }
  for (const [category, scene] of Object.entries(CATEGORY)) {
    jobs.push({ id: `act-any-${category}`, prompt: `${STYLE} ${scene}`, formats: ["square"] });
  }
  return jobs;
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

function convert(raw, args) {
  return execFileSync("magick", [raw, ...args], { maxBuffer: 64 * 1024 * 1024 });
}

/** JPEG 1080x1920 for Satori; magic bytes FF D8 FF are checked before upload. */
export function storyJpeg(raw) {
  const buf = convert(raw, ["-resize", "1080x1920^", "-gravity", "center", "-extent", "1080x1920", "-strip", "-quality", "82", "jpg:-"]);
  if (!(buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)) throw new Error(`${raw}: not a JPEG after convert`);
  return buf;
}

export function thumbWebp(raw) {
  const buf = convert(raw, ["-resize", "480x480^", "-gravity", "center", "-extent", "480x480", "-strip", "-quality", "76", "webp:-"]);
  if (buf.subarray(0, 4).toString() !== "RIFF" || buf.subarray(8, 12).toString() !== "WEBP") throw new Error(`${raw}: not WebP`);
  return buf;
}

function put(key, buf, type, outDir, dryRun) {
  if (dryRun) return console.log(`would put ${key} (${buf.length} B)`);
  const file = path.join(outDir, "upload", key.replace(/\//g, "_"));
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, buf);
  execFileSync("npx", ["wrangler", "r2", "object", "put", `${BUCKET}/${key}`, "--file", file, "--content-type", type,
    "--cache-control", "public, max-age=31536000, immutable", "--jurisdiction", "eu", "--remote"], { stdio: ["ignore", "ignore", "inherit"] });
}

function publish(outDir, dryRun) {
  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { story: {}, activity: {} };
  let added = 0;
  for (const job of JSON.parse(readFileSync(path.join(outDir, "jobs.json"), "utf8"))) {
    const story = /^story-([a-z-]+)-(skyline|street|night|food|nature|cafe)$/.exec(job.id);
    const act = /^act-(any|[a-z-]+)-([a-z]+)$/.exec(job.id);
    const raw = path.join(outDir, `${job.id}-${story ? "tall" : "square"}.png`);
    if (!existsSync(raw)) continue;
    if (story) {
      const buf = storyJpeg(raw);
      const hash = sha256(buf);
      put(`legacy/${hash}.jpg`, buf, "image/jpeg", outDir, dryRun);
      ((manifest.story[story[1]] ??= {}))[story[2]] = `/media/story/${hash}.jpg`;
    } else if (act) {
      const buf = thumbWebp(raw);
      const short = sha256(buf).slice(0, 8);
      put(`activity-thumbnails/${short}.webp`, buf, "image/webp", outDir, dryRun);
      const city = act[1] === "any" ? "_" : act[1];
      ((manifest.activity[city] ??= {}))[act[2]] = `/media/activity/${short}.webp`;
    } else continue;
    added++;
  }
  if (!dryRun) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${dryRun ? "dry run: " : ""}${added} image(s) in the manifest`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = args(process.argv.slice(2));
  const outDir = a.out && path.resolve(String(a.out));
  if (!outDir) throw new Error("--out DIR is required");
  if (a._[0] === "jobs") {
    mkdirSync(outDir, { recursive: true });
    const cities = typeof a.cities === "string" ? a.cities.split(",") : RING_1;
    const jobs = buildJobs(cities);
    writeFileSync(path.join(outDir, "jobs.json"), JSON.stringify(jobs, null, 2) + "\n");
    console.log(`${jobs.length} jobs -> ${path.join(outDir, "jobs.json")}`);
  } else if (a._[0] === "publish") publish(outDir, Boolean(a["dry-run"]));
  else throw new Error("usage: build.mjs jobs|publish --out DIR");
}
