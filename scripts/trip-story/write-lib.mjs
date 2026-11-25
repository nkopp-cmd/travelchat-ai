// Trip-story plan T3 (shared/plans/localley-trip-story-posts.md): a posted TikTok carousel trip -> one blog post.
// Input is the trip JSON of scripts/trip-story/export.mjs (T1). The model writes only prose from the stop facts;
// code places the painted day images, the headings, the planner link and the front matter, then checks the prose.
import { TELL } from "../weekly-post-draft.mjs";

export const WORDS = { min: 600, max: 1600 };
const SHA = /^[0-9a-f]{64}$/;
const NUMBER = /\d[\d,.]*\d|\d/g;
const norm = (n) => n.replace(/[,.]+$/, "").replace(/,/g, "");
const PHOTO_WORD = /\b(photo|photograph|picture|snapshot)s?\b/i;

export const slugify = (s) => String(s).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
export const imageLine = (alt, sha) => `![${alt}](/media/trip-story/${sha}-1080.webp)`;

/** Alt text for a painted day image. Says what it shows; never calls it a photo. */
export function dayAlt(trip, day) {
  const theme = day.theme ? `: ${day.theme.replace(/[[\]()]/g, "")}` : "";
  return `Painted illustration for day ${day.day} in ${trip.city}${theme}`;
}

/** One fact line per stop field we hold. The model may use nothing else. */
export function tripFacts(trip) {
  const lines = [];
  for (const day of trip.days) {
    lines.push(`Day ${day.day}${day.theme ? ` theme: ${day.theme}` : ""}`);
    for (const s of day.stops) {
      const f = s.facts ?? {};
      const bits = [`Day ${day.day} stop "${s.name}"`];
      if (s.category) bits.push(`category ${s.category}`);
      if (s.time) bits.push(`planned time ${s.time}`);
      if (s.duration) bits.push(`duration ${s.duration}`);
      if (s.cost) bits.push(`cost ${s.cost}`);
      lines.push(bits.join("; "));
      if (f.description) lines.push(`"${s.name}": ${f.description}`);
      for (const tip of f.tips ?? []) lines.push(`"${s.name}" tip: ${tip}`);
      if (f.bestTimes?.length) lines.push(`"${s.name}" best times: ${f.bestTimes.join(", ")}`);
      if (f.address) lines.push(`"${s.name}" address: ${f.address}`);
    }
  }
  return lines;
}

export function buildPrompt(trip, date) {
  return [
    `Write a trip story blog post for Localley (www.localley.io), a local-first travel planner for Asia. Today is ${date}.`,
    `It retells a real ${trip.days.length}-day plan for ${trip.city}${trip.title ? ` called "${trip.title}"` : ""}, day by day, for a first-time visitor.`,
    "",
    "Use ONLY the facts below. Do not add any other number, price, time, date, name or claim. If a fact is missing, leave it out.",
    "FACTS:",
    ...tripFacts(trip).map((l) => `- ${l}`),
    "",
    "Reply as JSON with these fields:",
    `- title: 30-70 characters, names ${trip.city} and the number of days, no colon-stacked clickbait.`,
    "- description: one sentence, 120-160 characters, for search results.",
    "- intro: 2-3 short paragraphs (plain text, paragraphs split by a blank line). The first sentence says what the trip is and who it suits.",
    `- days: exactly ${trip.days.length} items in day order, each {"heading": "<3-8 words, no 'Day N'>", "text": "<2-4 short paragraphs>"}.`,
    "  Each day text names every stop of that day exactly as written in the facts, in order, and says what to do there, when, and one tip if a tip exists.",
    "- Plain, friendly, concrete English. No Markdown headings, no links, no images, no lists, no emoji.",
    "- Do not mention AI, images, illustrations, TikTok, data, or how the post was made.",
  ].join("\n");
}

export const OUTPUT_SCHEMA = {
  type: "object", additionalProperties: false, required: ["title", "description", "intro", "days"],
  properties: {
    title: { type: "string" }, description: { type: "string" }, intro: { type: "string" },
    days: { type: "array", items: { type: "object", additionalProperties: false, required: ["heading", "text"], properties: { heading: { type: "string" }, text: { type: "string" } } } },
  },
};

const clean = (s) => String(s ?? "").replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

/** Code checks on the model reply. Returns problems (empty = pass). */
export function checkDraft(draft, trip) {
  const problems = [];
  const title = clean(draft?.title), description = clean(draft?.description), intro = clean(draft?.intro);
  const days = Array.isArray(draft?.days) ? draft.days : [];
  if (title.length < 30 || title.length > 70) problems.push(`title length ${title.length}`);
  if (!title.includes(trip.city)) problems.push("title without city");
  if (description.length < 80 || description.length > 200) problems.push("description length");
  if (!intro) problems.push("no intro");
  if (days.length !== trip.days.length) return [...problems, `days ${days.length} != ${trip.days.length}`];
  const prose = [title, description, intro, ...days.flatMap((d) => [clean(d.heading), clean(d.text)])];
  const all = prose.join("\n");
  trip.days.forEach((day, i) => {
    const text = clean(days[i].text), heading = clean(days[i].heading);
    if (!heading || heading.length > 60) problems.push(`day ${day.day} heading`);
    for (const s of day.stops) if (!text.includes(s.name)) problems.push(`day ${day.day} misses "${s.name}"`);
  });
  if (/^\s*(#|[-*] |\d+\. |!\[|\|)/m.test(all) || /\]\(|https?:\/\//.test(all)) problems.push("markdown or links in prose");
  if (PHOTO_WORD.test(all) || /\b(ai|tiktok|illustrat\w*|image)s?\b/i.test(all)) problems.push("mentions images or how it was made");
  for (const re of TELL) if (re.test(all)) problems.push(`tell ${re.source}`);
  const words = all.split(/\s+/).filter((w) => /\w/.test(w)).length;
  if (words < WORDS.min || words > WORDS.max) problems.push(`words ${words}`);
  const known = new Set(tripFacts(trip).join(" ").match(NUMBER)?.map(norm) ?? []);
  for (const n of new Set((all.match(NUMBER) ?? []).map(norm))) {
    if (!known.has(n) && !(/^\d+$/.test(n) && Number(n) >= 1 && Number(n) <= 10)) problems.push(`number ${n} not in facts`);
  }
  return problems;
}

/** Front matter + Markdown body. Images, headings and the planner link come from code, not the model. */
export function postFile({ trip, date, draft }) {
  for (const sha of [trip.cover, ...trip.days.map((d) => d.image)]) if (!SHA.test(sha)) throw new Error(`bad image sha ${sha}`);
  const coverAlt = `Painted illustration of a ${trip.days.length}-day trip in ${trip.city}`;
  if (PHOTO_WORD.test(coverAlt)) throw new Error("cover alt");
  const meta = [`title: ${clean(draft.title).replace(/\s+/g, " ")}`, `description: ${clean(draft.description).replace(/\s+/g, " ")}`,
    `published: ${date}`, `updated: ${date}`, `illustration: ${trip.cover}`, `illustrationAlt: ${coverAlt}`];
  const parts = [clean(draft.intro)];
  trip.days.forEach((day, i) => {
    parts.push(`## Day ${day.day}: ${clean(draft.days[i].heading).replace(/\s+/g, " ")}`, imageLine(dayAlt(trip, day), day.image), clean(draft.days[i].text));
  });
  parts.push("## Plan your own trip", `Start from this route and change any stop in the [${trip.city} trip planner](/itineraries/new?city=${encodeURIComponent(trip.city)}).`);
  return `---\n${meta.join("\n")}\n---\n${parts.join("\n\n")}\n`;
}

export const postName = (trip, date, title) => `${date}-${slugify(title || `${trip.city} ${trip.days.length} day trip`)}.md`;

/** Drafts one post (max 2 attempts). generate(prompt, schema) returns the JSON reply. */
export function draftTripPost({ trip, date, generate, log = () => {}, attempts = 2 }) {
  if (!trip?.days?.length) return { ok: false, reason: "trip without days" };
  const prompt = buildPrompt(trip, date);
  let problems = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const retry = problems.length ? `\n\nYour previous reply failed these checks: ${problems.join("; ")}. Fix all of them.` : "";
    const draft = generate(prompt + retry, OUTPUT_SCHEMA);
    problems = checkDraft(draft, trip);
    log(`attempt ${attempt}: ${problems.length ? problems.join("; ") : "pass"}`);
    if (!problems.length) return { ok: true, file: postName(trip, date, clean(draft.title)), source: postFile({ trip, date, draft }) };
  }
  return { ok: false, reason: problems.join("; ") };
}
