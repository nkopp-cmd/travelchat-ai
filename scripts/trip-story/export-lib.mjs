// Trip-story plan T1 (shared/plans/localley-trip-story-posts.md): pure parts of the export.
// A posted TikTok carousel trip -> trip JSON for a blog post, from grounded rows only (itinerary + visible spots).

export const BG_SOURCE = "codex-realistic-v2";
export const DERIVATIVE_WIDTHS = [1080, 540]; // 4:5 section images (1080x1350, 540x675)
export const DERIVATIVE_FORMATS = ["avif", "webp"];
const STORY_PATH = /^\/media\/story\/([0-9a-f]{64})\.(?:jpg|png)$/;

/** sha256 of a /media/story/<sha>.jpg path; null for anything else. */
export function storySha(path) {
  const match = STORY_PATH.exec(String(path ?? ""));
  return match ? match[1] : null;
}

/** R2 key and public path of one derivative. */
export const derivativeKey = (sha, width, format) => `trip-story/${sha}-${width}.${format}`;
export const derivativePath = (sha, width, format) => `/media/trip-story/${sha}-${width}.${format}`;

/** Published carousel trips with our own story backgrounds, newest post first, one entry per itinerary. */
export function postedTrips(ledger) {
  const marked = new Set((ledger?.generated ?? []).filter((g) => g.bgSource === BG_SOURCE).map((g) => g.itineraryId));
  const seen = new Set();
  return [...(ledger?.posts ?? [])]
    .filter((p) => p.status === "published" && marked.has(p.itineraryId))
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .filter((p) => (seen.has(p.itineraryId) ? false : seen.add(p.itineraryId)))
    .map((p) => ({ itineraryId: p.itineraryId, city: p.city, postedAt: p.at }));
}

const parse = (value) => {
  if (value && typeof value === "object") return value;
  try { return JSON.parse(String(value ?? "")); } catch { return null; }
};
const text = (value) => {
  const v = parse(value) ?? value;
  if (v && typeof v === "object") return String(v.en ?? Object.values(v).find((x) => typeof x === "string") ?? "").trim();
  return typeof v === "string" ? v.trim() : "";
};
const list = (value) => {
  const v = parse(value);
  return Array.isArray(v) ? v.map((x) => text(x)).filter(Boolean) : [];
};
const dayPlans = (activities) => {
  const plan = parse(activities);
  return Array.isArray(plan) ? plan : Array.isArray(plan?.dailyPlans) ? plan.dailyPlans : [];
};

/**
 * One trip: cover + summary + one image per day, and per day the stops that name a visible spot row.
 * Returns { trip } or { skip: reason }. A trip with any missing slide image is skipped (no half posts).
 */
export function buildTrip({ itinerary, spots, postedAt = null }) {
  if (!itinerary) return { skip: "itinerary missing" };
  const backgrounds = parse(itinerary.ai_backgrounds) ?? {};
  const days = dayPlans(itinerary.activities);
  if (!days.length) return { skip: "no days" };
  const cover = storySha(backgrounds.cover), summary = storySha(backgrounds.summary);
  if (!cover || !summary) return { skip: "cover or summary image missing" };
  const byId = new Map((spots ?? []).filter((s) => Number(s.visible) === 1).map((s) => [s.id, s]));
  const out = [];
  for (const [index, day] of days.entries()) {
    const image = storySha(backgrounds[`day${index + 1}`]);
    if (!image) return { skip: `day${index + 1} image missing` };
    const stops = (Array.isArray(day?.activities) ? day.activities : []).flatMap((a) => {
      const spot = byId.get(a?.spotId);
      if (!spot) return [];
      return [{
        spotId: spot.id,
        name: text(spot.name) || text(a.name),
        category: text(spot.category) || text(a.category),
        time: text(a.time) || null,
        duration: text(a.duration) || null,
        cost: text(a.cost) || null,
        plan: text(a.description) || null,
        facts: {
          description: text(spot.description) || null,
          tips: list(spot.tips),
          bestTimes: list(spot.best_times),
          address: text(spot.address_json) || text(spot.address) || null,
          localleyScore: Number(spot.localley_score) || null,
        },
      }];
    });
    if (!stops.length) return { skip: `day${index + 1} has no visible spot` };
    out.push({ day: index + 1, theme: text(day?.theme) || null, image, stops });
  }
  return {
    trip: {
      itineraryId: itinerary.id,
      city: text(itinerary.city),
      title: text(itinerary.title),
      postedAt,
      cover,
      summary,
      days: out,
    },
  };
}

/** Every image sha a trip needs derivatives for (cover, days, summary), de-duplicated. */
export const tripImages = (trip) => [...new Set([trip.cover, ...trip.days.map((d) => d.image), trip.summary])];
