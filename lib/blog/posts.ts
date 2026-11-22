import bundle from "./posts.generated.json";

/** Weekly blog (shared/plans/weekly-blog.md): Markdown files in content/blog, bundled by scripts/blog-index.mjs. */
export type BlogPost = {
  slug: string;
  file: string;
  title: string;
  description: string;
  published: string;
  updated: string;
  image?: string;
  photo?: BlogPhoto;
  body: string;
  /** City of the post's own planner link (`/itineraries/new?city=<City>`), for the planner button under the post. */
  plannerCity?: string;
};

const PLANNER_CITY = /\(\/itineraries\/new\?city=([A-Z][A-Za-z]*(?:%20[A-Z][A-Za-z]*)*)\)/;

/**
 * Push CA4: the lead paragraphs (the answer) come before the photo, the rest after it (content first). On a phone the
 * photo then starts near the fold, so the first paint already shows the answer and the photo does not hold up LCP.
 * No "## " section -> the whole body is the lead.
 */
export function splitLead(body: string): { lead: string; rest: string } {
  const at = body.search(/^## /m);
  if (at <= 0) return at === 0 ? { lead: "", rest: body } : { lead: body, rest: "" };
  return { lead: body.slice(0, at).trimEnd(), rest: body.slice(at) };
}

/** Push CI1: the first "## " section of `rest`, then everything after it (the photo goes between, below the phone fold). */
export function splitFirstSection(rest: string): { first: string; after: string } {
  const at = rest.slice(3).search(/^## /m);
  if (!rest.startsWith("## ") || at < 0) return { first: rest, after: "" };
  return { first: rest.slice(0, at + 3).trimEnd(), after: rest.slice(at + 3) };
}

/** Push BL2: the first planner link in the body names the post's city; none -> undefined. */
export function postPlannerCity(body: string): string | undefined {
  const match = PLANNER_CITY.exec(body);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Planner URL for one city (the planner reads ?city= and opens at the trip-length step). */
export function plannerHref(city: string): string {
  return `/itineraries/new?city=${encodeURIComponent(city)}`;
}

/** One own place photo (R2, /media/spot) at the top of a post, with its credit line. */
export type BlogPhoto = { src: string; alt: string; credit: string; width: number; height: number };

const OWN_PHOTO = /^\/media\/spot\/[0-9a-f-]{36}\/[0-9a-f]{64}\.webp$/;
const SIZE = /^(\d{2,5})x(\d{2,5})$/;

function parsePhoto(file: string, meta: Record<string, string>): BlogPhoto | undefined {
  if (!meta.photo) return undefined;
  if (!OWN_PHOTO.test(meta.photo)) throw new Error(`${file}: photo must be an own /media/spot/<id>/<sha>.webp path`);
  const size = SIZE.exec(meta.photoSize ?? "");
  if (!meta.photoAlt || !meta.photoCredit || !size) throw new Error(`${file}: photo needs photoAlt, photoCredit and photoSize (<w>x<h>)`);
  return { src: meta.photo, alt: meta.photoAlt, credit: meta.photoCredit, width: Number(size[1]), height: Number(size[2]) };
}

const FILE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parses one post file: a `---` front matter block of `key: value` lines, then Markdown. */
export function parsePost(file: string, source: string): BlogPost {
  const name = FILE.exec(file);
  if (!name) throw new Error(`${file}: name must be <yyyy-mm-dd>-<slug>.md`);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`${file}: missing front matter`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) meta[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  for (const key of ["title", "description", "published", "updated"]) {
    if (!meta[key]) throw new Error(`${file}: front matter needs ${key}`);
  }
  if (!DATE.test(meta.published) || !DATE.test(meta.updated)) throw new Error(`${file}: dates must be yyyy-mm-dd`);
  if (meta.published !== name[1]) throw new Error(`${file}: published must match the file date`);
  if (meta.updated < meta.published) throw new Error(`${file}: updated is before published`);
  return {
    slug: name[2], file, title: meta.title, description: meta.description,
    published: meta.published, updated: meta.updated, image: meta.image || undefined, photo: parsePhoto(file, meta), body: match[2].trim(),
    plannerCity: postPlannerCity(match[2]),
  };
}

/** All posts, newest first. */
export const BLOG_POSTS: BlogPost[] = (bundle as { file: string; source: string }[]).map((p) => parsePost(p.file, p.source));

export function blogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

export const BLOG_URL = "https://www.localley.io/blog";
export const BLOG_TITLE = "Localley Journal";
export const BLOG_DESCRIPTION = "Practical guides for travellers in Seoul and Asia: paying, getting around, eating and planning a day like a local.";

export function formatPostDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Cities the posts plan for, newest post first, each once. */
export function blogPlannerCities(posts: readonly BlogPost[] = BLOG_POSTS): string[] {
  return [...new Set(posts.flatMap((p) => (p.plannerCity ? [p.plannerCity] : [])))];
}
