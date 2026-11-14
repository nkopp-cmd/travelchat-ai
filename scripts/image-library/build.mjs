#!/usr/bin/env node
// Image library for story backgrounds and activity thumbnails (reach-engine R8, weekend-sprint L5).
//
//   node scripts/image-library/build.mjs jobs  --out DIR [--cities seoul,tokyo]   -> DIR/jobs.json (top 10 cities first)
//   python3 shared/scripts/codex-image.py DIR/jobs.json --out DIR                 -> DIR/<id>-<shape>.png (ChatGPT plan)
//   node scripts/image-library/build.mjs publish --out DIR [--dry-run]           -> R2 upload + lib/image-library.json
//
// Style (Nils 2026-11-14, approved on claude-work/localley-style-samples/review-sheet.jpg): warm editorial
// field-guide travel photography, vibrant but natural colours, violet dusk tone. Generic city scenes only: never a
// named landmark, shop or venue. Story images are JPEG (Satori renders no WebP), thumbnails WebP.
// The painted gouache set is retired. Publish replaces the whole manifest and sets "live": true.
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

const STYLE = "Warm editorial travel photograph, field-guide style, documentary magazine look, 35mm lens, eye level. " +
  "Vibrant but natural colours, inviting, golden or warm light with a subtle violet dusk tone in the sky and shadows. " +
  "Generic scene only: no named landmark, no real shop or venue, no readable text, signs or logos.";
const STORY_FRAME = "Vertical frame. Calm darker sky area in the top third and darker ground in the bottom quarter for overlaid text.";
const THUMB_FRAME = "Subject centered so a 4:3 crop works.";

// Mood words per city: what the place feels like, never a named building.
export const CITY_FEEL = {
  seoul: "an East Asian megacity between granite mountains, low hanok-style tiled roofs beside modern towers, a wide river",
  tokyo: "a dense Japanese city of narrow lanes, small wooden houses beside glass towers, overhead power lines, trains",
  bangkok: "a humid Southeast Asian river city, gilded temple roof shapes, long-tail boats, tropical trees and canals",
  singapore: "a green tropical city-state, shophouse rows in pastel colours, lush trees, a calm harbour at the edge",
  // Every other enabled city, in rough traffic order (a run stops at the plan cap and resumes where it stopped).
  osaka: "a lively Japanese merchant city of canals, neon-lit shopping arcades, small food counters and river bridges",
  kyoto: "an old Japanese city of wooden machiya townhouses, quiet stone lanes, moss gardens and wooded hills",
  taipei: "a subtropical East Asian city with green mountains around it, scooters, covered arcades and night-market lights",
  "hong-kong": "a vertical harbour city of steep streets, dense high-rises against green peaks, trams and ferries",
  busan: "a Korean port city of hillside houses in pastel colours, a long sandy beach, fishing boats and bridges",
  jeju: "a volcanic Korean island of black basalt stone walls, tangerine orchards, green craters and a blue sea",
  hanoi: "a Vietnamese capital of narrow tube houses, yellow facades, tangled wires, lakes and street stools",
  "ho-chi-minh": "a busy south Vietnamese city of motorbike streams, French-era yellow buildings, a brown river, palms",
  "kuala-lumpur": "a tropical Malaysian city of glass towers above old shophouses, rain trees and warm evening storms",
  "bali-ubud": "a green Balinese hill town of rice terraces, carved stone gates, offerings and jungle ravines",
  "bali-canggu": "a Balinese surf coast of black-sand beaches, rice fields, palm-lined lanes and small surf cafes",
  "chiang-mai": "a northern Thai old town inside a moat, brick ruins, teak houses, mountains and slow lanes",
  keelung: "a rainy Taiwanese harbour town of green hills, colourful fishing boats, stairs and a night-food street",
  yilan: "a green Taiwanese plain of rice paddies, hot springs, mountains in mist and a long quiet coast",
  "da-nang": "a central Vietnamese beach city of a long white beach, green mountains, river bridges and fishing baskets",
  penang: "a Malaysian island town of faded colonial shophouses, clan-house roofs, street murals and hawker smoke",
  nara: "a calm old Japanese town of large park lawns, deer, wooden temple roofs and stone lanterns",
  kanazawa: "a Japanese castle town of samurai-district earthen walls, teahouse lanes, gardens and gold-leaf craft",
  gyeongju: "an old Korean royal town of grassy burial mounds, low tiled-roof houses, lotus ponds and cherry trees",
  sapporo: "a snowy north Japanese city of wide grid streets, low snowy rooftops, parks and warm bars",
  okinawa: "a subtropical Japanese island of turquoise bays, red-tiled houses with lion figures, sugar cane and coral",
  manila: "a Philippine bay city of colourful jeepneys, old Spanish stone walls, palms and a red sunset over the bay",
  phuket: "a Thai island of limestone cliffs, turquoise bays, long-tail boats and pastel Sino-Portuguese houses",
  "siem-reap": "a Cambodian river town of jungle ruins in the distance, tuk-tuks, rice fields and sugar palms",
  "hoi-an": "an old Vietnamese river town of yellow walls, wooden shopfronts, silk lanterns and small boats",
  "luang-prabang": "a Lao river town on a green peninsula, French-era villas, golden temple roofs and slow river boats",
};

// Story themes x lights (Nils 2026-11-14 CHANGE): the day picker (lib/image-library.ts) matches each itinerary day
// to its dominant theme and light. Words stay generic: never a real venue name.
export const THEMES = {
  cafe: ["cafe hopping", "coffee cups, pastries, a quiet window seat"],
  food: ["local food and markets", "street food stalls, steaming dishes, market produce"],
  nature: ["parks and nature", "garden paths, old trees, a quiet viewpoint"],
  culture: ["temples, heritage and museums", "old tiled temple roofs, stone courtyards, a calm gallery hall"],
  nightlife: ["nightlife", "small cocktail bars, glowing lanterns, a late street"],
  shopping: ["shopping streets", "small boutiques, a covered arcade, craft stalls"],
  neighborhood: ["a neighborhood walk", "quiet lanes, low houses, potted plants"],
};
export const LIGHTS = {
  day: "Lighting: natural daylight turning golden, low warm sun, a subtle violet tone in sky and shadows.",
  night: "Lighting: blue hour into night, warm glowing windows and lamps, a deep violet-blue sky.",
};
/** Top 10 cities by traffic: generated first, all themes x lights (Nils 2026-11-14). */
export const TOP_CITIES = ["seoul", "tokyo", "bangkok", "singapore", "osaka", "kyoto", "taipei", "hong-kong", "busan", "jeju"];

const cityName = (slug) => slug.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");

/** Live generateDayBackground text (lib/imagen.ts before #769) + theme words + the approved photo style. */
export function storyPrompt(city, theme, light) {
  const name = cityName(city);
  const [label, words] = THEMES[theme];
  return `Professional travel photograph showcasing a day in ${name}: ${label}. ` +
    `Scene: Beautiful atmospheric shot representing ${words} in ${name}. Setting: ${CITY_FEEL[city]}. ` +
    `${STYLE} ${LIGHTS[light]} Composition: Vertical 9:16 portrait, balanced framing, depth and layers. ${STORY_FRAME} ` +
    `STRICT REQUIREMENTS: NO text, words, letters, or watermarks. NO people or crowds visible. NO logos or brand names. ` +
    `Evokes the feeling of ${label}.`;
}

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

/**
 * Story jobs (tall): every theme x light for each city, cities in the given order (TOP_CITIES first by default),
 * then generic activity thumbnails (square). Ids: story-<city>-<theme>-<light>, act-any-<category>.
 */
export function buildJobs(cities = Object.keys(CITY_FEEL)) {
  const jobs = [];
  for (const city of cities) {
    if (!CITY_FEEL[city]) throw new Error(`no mood text for ${city}`);
    for (const theme of Object.keys(THEMES)) for (const light of Object.keys(LIGHTS)) {
      jobs.push({ id: `story-${city}-${theme}-${light}`, prompt: storyPrompt(city, theme, light), formats: ["story"] });
    }
  }
  for (const [category, scene] of Object.entries(CATEGORY)) {
    jobs.push({ id: `act-any-${category}`, prompt: `${STYLE} ${scene} ${THUMB_FRAME}`, formats: ["square"] });
  }
  return jobs;
}

/** Default generation order: the top 10 cities, then every other city in CITY_FEEL order. */
export const JOB_CITIES = [...TOP_CITIES, ...Object.keys(CITY_FEEL).filter((c) => !TOP_CITIES.includes(c))];

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

const pathsOf = (m) => [...Object.values(m.story ?? {}), ...Object.values(m.activity ?? {})].flatMap((set) => Object.values(set ?? {}));

/** Old retired paths + every previous path that the new manifest no longer uses, sorted and unique. */
export function retiredPaths(previous, next) {
  const keep = new Set(pathsOf(next));
  return [...new Set([...(previous.retired ?? []), ...pathsOf(previous)])].filter((p) => !keep.has(p)).sort();
}

function publish(outDir, dryRun) {
  // The whole set is replaced. Every path of the previous manifest that is not in the new one goes to "retired",
  // so the painted set stays refused by the media routes (lib/image-library.ts isRetiredLibraryPath).
  const previous = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, "utf8")) : { story: {}, activity: {} };
  const manifest = { live: true, story: {}, activity: {}, retired: [] };
  let added = 0;
  for (const job of JSON.parse(readFileSync(path.join(outDir, "jobs.json"), "utf8"))) {
    const story = /^story-([a-z-]+)-(cafe|food|nature|culture|nightlife|shopping|neighborhood)-(day|night)$/.exec(job.id);
    const act = /^act-(any|[a-z-]+)-([a-z]+)$/.exec(job.id);
    const raw = path.join(outDir, `${job.id}-${story ? "tall" : "square"}.png`);
    if (!existsSync(raw)) continue;
    if (story) {
      const buf = storyJpeg(raw);
      const hash = sha256(buf);
      put(`legacy/${hash}.jpg`, buf, "image/jpeg", outDir, dryRun);
      ((manifest.story[story[1]] ??= {}))[`${story[2]}-${story[3]}`] = `/media/story/${hash}.jpg`;
    } else if (act) {
      const buf = thumbWebp(raw);
      const short = sha256(buf).slice(0, 8);
      put(`activity-thumbnails/${short}.webp`, buf, "image/webp", outDir, dryRun);
      const city = act[1] === "any" ? "_" : act[1];
      ((manifest.activity[city] ??= {}))[act[2]] = `/media/activity/${short}.webp`;
    } else continue;
    added++;
  }
  manifest.retired = retiredPaths(previous, manifest);
  if (!dryRun) writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`${dryRun ? "dry run: " : ""}${added} image(s) in the manifest`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = args(process.argv.slice(2));
  const outDir = a.out && path.resolve(String(a.out));
  if (!outDir) throw new Error("--out DIR is required");
  if (a._[0] === "jobs") {
    mkdirSync(outDir, { recursive: true });
    const cities = typeof a.cities === "string" ? a.cities.split(",") : JOB_CITIES;
    const jobs = buildJobs(cities);
    writeFileSync(path.join(outDir, "jobs.json"), JSON.stringify(jobs, null, 2) + "\n");
    console.log(`${jobs.length} jobs -> ${path.join(outDir, "jobs.json")}`);
  } else if (a._[0] === "publish") publish(outDir, Boolean(a["dry-run"]));
  else throw new Error("usage: build.mjs jobs|publish --out DIR");
}
