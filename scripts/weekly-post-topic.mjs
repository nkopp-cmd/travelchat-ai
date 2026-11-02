// Weekly blog topic picker (shared/plans/weekly-blog.md item 3). Code only, no model.
// Ranks candidate posts from:
//   b) our own checked data: lib/help/pay.json (per country) and the phrase cards (lib/help/source.json);
//   d) the season calendar below (month windows only; no guessed dates).
// a) Search Console tasks join once gsc-pull writes claude-work/seo/localley.io.json; c) inquiries have no rows yet.
// Never repeats a topic of the last 12 weeks (slug token overlap with content/blog).
//   node scripts/weekly-post-topic.mjs [--date YYYY-MM-DD] [--top N]   prints JSON
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLOG_DIR, POST_FILE, blogFiles } from "./blog-index.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86_400_000;
export const REPEAT_WINDOW_DAYS = 84;
export const OVERLAP_LIMIT = 0.5;

// Country of the help pages -> the city a post leads with (Ring 1 cities first in rank).
export const COUNTRIES = {
  korea: { city: "Seoul", lang: "ko", ring1: true },
  japan: { city: "Tokyo", lang: "ja", ring1: true },
  thailand: { city: "Bangkok", lang: "th", ring1: true },
  singapore: { city: "Singapore", lang: null, ring1: true },
  vietnam: { city: "Hanoi", lang: "vi", ring1: false },
  taiwan: { city: "Taipei", lang: "zh-TW", ring1: false },
};

// Months are 1-12; a window may wrap the year end (from 12 to 2).
export const SEASONS = [
  { slug: "seoul-cherry-blossom-guide", title: "Cherry blossom in Seoul: where and when to go", from: 3, to: 4, link: "/itineraries/new?city=Seoul" },
  { slug: "seoul-rainy-season-plan", title: "Seoul in the rainy season: indoor days that still feel local", from: 6, to: 7, link: "/itineraries/new?city=Seoul" },
  { slug: "seoul-summer-heat-day-plan", title: "A Seoul day in summer heat: early starts, cool stops, late markets", from: 7, to: 8, link: "/itineraries/new?city=Seoul" },
  { slug: "seoul-chuseok-visitor-guide", title: "Chuseok in Seoul as a visitor: what closes, what opens", from: 9, to: 10, link: "/help/korea" },
  { slug: "seoul-autumn-leaves-guide", title: "Autumn leaves in and around Seoul", from: 10, to: 11, link: "/itineraries/new?city=Seoul" },
  { slug: "seoul-winter-day-plan", title: "Seoul in winter: warm food, heated floors and short walks", from: 12, to: 2, link: "/itineraries/new?city=Seoul" },
  { slug: "korea-ski-trip-from-seoul", title: "Ski days from Seoul without a car", from: 12, to: 2, link: "/help/korea" },
  { slug: "seoul-lunar-new-year-visitor-guide", title: "Seollal in Seoul as a visitor: what closes, what opens", from: 1, to: 2, link: "/help/korea" },
  { slug: "tokyo-cherry-blossom-guide", title: "Cherry blossom in Tokyo: quiet spots and timing", from: 3, to: 4, link: "/itineraries/new?city=Tokyo" },
  { slug: "bangkok-songkran-guide", title: "Songkran in Bangkok: how to enjoy the water festival", from: 4, to: 4, link: "/help/thailand" },
];

const STOP = new Set(["a", "an", "and", "the", "in", "of", "to", "for", "as", "guide", "visitor", "plan", "day"]);
const CITY_TOKENS = new Set(Object.values(COUNTRIES).flatMap((c) => c.city.toLowerCase().split(/\s+/)));
export const slugTokens = (slug) => new Set(slug.split("-").filter((t) => t && !STOP.has(t)));

// Jaccard overlap of slug words. Posts about different cities never clash.
export function overlap(a, b) {
  const x = slugTokens(a);
  const y = slugTokens(b);
  const cx = [...x].filter((t) => CITY_TOKENS.has(t)).sort().join();
  const cy = [...y].filter((t) => CITY_TOKENS.has(t)).sort().join();
  if (!x.size || !y.size || (cx && cy && cx !== cy)) return 0;
  let shared = 0;
  for (const t of x) if (y.has(t)) shared += 1;
  return shared / (x.size + y.size - shared);
}

/** Slugs published in the repeat window before `date`. */
export function recentSlugs(files, date) {
  const since = date.getTime() - REPEAT_WINDOW_DAYS * DAY;
  return files.flatMap((file) => {
    const [, day, slug] = POST_FILE.exec(file);
    const t = Date.parse(`${day}T00:00:00Z`);
    return t >= since && t <= date.getTime() ? [slug] : [];
  });
}

/** Days from `date` to the next start of a month window, or 0 inside the window. */
export function seasonLead(season, date) {
  const month = date.getUTCMonth() + 1;
  const inside = season.from <= season.to
    ? month >= season.from && month <= season.to
    : month >= season.from || month <= season.to;
  if (inside) return 0;
  const year = date.getUTCFullYear() + (season.from < month ? 1 : 0);
  return Math.round((Date.UTC(year, season.from - 1, 1) - date.getTime()) / DAY);
}

// A post needs lead time to rank: best 3-8 weeks before the window opens.
export function seasonScore(lead) {
  if (lead >= 14 && lead <= 60) return 90;
  if (lead === 0) return 60;
  if (lead > 60 && lead <= 90) return 50;
  return 0;
}

export function helpCandidates(pay, phrases) {
  const out = [];
  for (const [country, meta] of Object.entries(COUNTRIES)) {
    const city = meta.city.toLowerCase().replace(/\s+/g, "-");
    const bonus = meta.ring1 ? 10 : 0;
    if (pay.countries[country]) {
      out.push({
        slug: `paying-in-${city}`,
        title: `How to pay in ${meta.city} as a visitor: cards, cash, transit cards and ATMs`,
        source: `lib/help/pay.json ${country} (checked ${pay.checkedAt})`,
        link: `/help/${country}/pay`,
        score: 70 + bonus,
      });
    }
    if (!meta.lang) continue;
    for (const cat of phrases.categories) {
      if (cat.id !== "food" && cat.id !== "transport") continue;
      const topic = cat.id === "food" ? "ordering-food" : "getting-around";
      out.push({
        slug: `${topic}-in-${city}-phrases`,
        title: `${cat.id === "food" ? "Ordering food" : "Getting around"} in ${meta.city}: ${cat.phrases.length} phrases that work`,
        source: `lib/help/source.json ${cat.id} + translations.json ${meta.lang}`,
        link: cat.id === "food" ? `/help/${country}/menu` : `/help/${country}`,
        score: 55 + bonus,
      });
    }
  }
  return out;
}

export function seasonCandidates(date) {
  return SEASONS.flatMap((s) => {
    const lead = seasonLead(s, date);
    const score = seasonScore(lead);
    return score ? [{ slug: s.slug, title: s.title, source: `season calendar (opens in ${lead} days)`, link: s.link, score }] : [];
  });
}

export function rankTopics({ date, files, pay, phrases }) {
  const recent = recentSlugs(files, date);
  const all = [...seasonCandidates(date), ...helpCandidates(pay, phrases)];
  return all
    .map((c) => {
      const clash = recent.find((slug) => overlap(slug, c.slug) >= OVERLAP_LIMIT);
      return clash ? { ...c, skipped: `repeats ${clash}` } : c;
    })
    .filter((c) => !c.skipped)
    .sort((a, b) => b.score - a.score || a.slug.localeCompare(b.slug));
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const day = arg("--date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error("--date must be YYYY-MM-DD");
  const top = Number(arg("--top") ?? 5);
  const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
  const ranked = rankTopics({
    date: new Date(`${day}T00:00:00Z`),
    files: blogFiles(BLOG_DIR),
    pay: read("lib/help/pay.json"),
    phrases: read("lib/help/source.json"),
  });
  console.log(JSON.stringify({ date: day, topics: ranked.slice(0, top) }, null, 2));
}
