// Trip-story plan T5 (shared/plans/localley-trip-story-posts.md): which posted carousel trip becomes the next post.
// Caps: at most MAX_PER_WEEK trip-story posts in any 7 days, one post per city in CITY_GAP_DAYS, one post per trip.

export const MAX_PER_WEEK = 2;
export const CITY_GAP_DAYS = 60;
const DAY_MS = 86_400_000;

/** A trip-story post from its Markdown source: { date, cover, city } or null for other posts. */
export function tripPostInfo(file, source) {
  const date = /^(\d{4}-\d{2}-\d{2})-/.exec(file)?.[1];
  const cover = /\nillustration: ([0-9a-f]{64})\n/.exec(source)?.[1];
  const city = /\/itineraries\/new\?city=([^)\s]+)\)/.exec(source)?.[1];
  if (!date || !cover) return null;
  return { date, cover, city: city ? decodeURIComponent(city) : null };
}

const days = (from, to) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;

/**
 * candidates: posted trips, newest first ({ itineraryId, city, cover }); posts: tripPostInfo rows; today: YYYY-MM-DD.
 * Returns { pick } or { pick: null, reason }.
 */
export function pickTrip({ candidates, posts, today }) {
  const recent = posts.filter((p) => days(p.date, today) < 7);
  if (recent.length >= MAX_PER_WEEK) return { pick: null, reason: `${recent.length} trip posts in the last 7 days (max ${MAX_PER_WEEK})` };
  const covers = new Set(posts.map((p) => p.cover));
  const blockedCity = (city) => posts.some((p) => p.city && city && p.city.toLowerCase() === city.toLowerCase() && days(p.date, today) < CITY_GAP_DAYS);
  const pick = candidates.find((c) => !covers.has(c.cover) && !blockedCity(c.city));
  return pick ? { pick } : { pick: null, reason: "every posted trip already has a post or its city had one in the last 60 days" };
}

/** Telegram preview text (PRIME RULE 4: publish at once, Nils' "no" blocks). */
export function previewText({ slug, pr, title, source }) {
  const body = source.replace(/^---[\s\S]*?\n---\n/, "").replace(/!\[[^\]]*\]\([^)]*\)\n*/g, "");
  const text = `Localley trip-story post "${title}" goes live automatically after CI (PRIME RULE 4).\nReply "no trip ${slug}" to stop or unpublish it.\nPR: ${pr}\nURL after release: https://www.localley.io/blog/${slug}\n\n${body}`;
  return text.length > 3800 ? `${text.slice(0, 3800)}\n...` : text;
}
