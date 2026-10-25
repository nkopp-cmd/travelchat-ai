import { ALL_CITIES } from "@/lib/cities";

/** Community Q&A rules (shared/plans/localley-helper-community.md phase 2). Pure: no database, no auth. */
export const COMMUNITY_TOPICS = [
  { id: "food", label: "Food" },
  { id: "transport", label: "Getting around" },
  { id: "money", label: "Money & paying" },
  { id: "language", label: "Language" },
  { id: "safety", label: "Safety & health" },
  { id: "sights", label: "Things to do" },
  { id: "stay", label: "Where to stay" },
  { id: "meetup", label: "Meetups" },
  { id: "other", label: "Other" },
] as const;

export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number]["id"];
export const REPORT_REASONS = ["spam", "abuse", "unsafe", "wrong", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Per-user daily posting limits, checked against the tables (fail closed, no extra binding). */
export const DAILY_LIMITS = { question: 10, answer: 40, tip: 20 } as const;
/** At most this many trips that have not ended yet, per user. */
export const ACTIVE_TRIP_LIMIT = 5;

export const LIMITS = { titleMin: 8, titleMax: 140, bodyMax: 2000, answerMin: 2, tipMin: 3, tipMax: 280 } as const;

export function communityCities() {
  return ALL_CITIES.map((c) => ({ slug: c.slug, name: c.name, country: c.country }));
}

export function isCommunityCity(slug: string): boolean {
  return ALL_CITIES.some((c) => c.slug === slug);
}

export function isCommunityTopic(id: string): id is CommunityTopic {
  return COMMUNITY_TOPICS.some((t) => t.id === id);
}

export function topicLabel(id: string): string {
  return COMMUNITY_TOPICS.find((t) => t.id === id)?.label ?? id;
}

// Pre-filter before the AI/report moderation item: no links, e-mail addresses or phone numbers (spam and touts).
const LINK = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|me|ly|xyz|info|biz|link|site|shop)\b/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /(?:\+?\d[\s().-]?){9,}/;

export type TextVerdict = { ok: true; value: string } | { ok: false; error: string };

function clean(text: unknown): string {
  return typeof text === "string" ? text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim() : "";
}

export function checkContact(text: string): string | null {
  if (LINK.test(text)) return "Links are not allowed yet. Describe the place instead.";
  if (EMAIL.test(text) || PHONE.test(text)) return "Please do not post e-mail addresses or phone numbers.";
  return null;
}

export function checkQuestion(input: { title: unknown; body: unknown; city: unknown; topic: unknown }):
  { ok: true; value: { title: string; body: string; city: string; topic: CommunityTopic } } | { ok: false; error: string } {
  const title = clean(input.title).replace(/\n/g, " ");
  const body = clean(input.body);
  const city = typeof input.city === "string" ? input.city : "";
  const topic = typeof input.topic === "string" ? input.topic : "";
  if (title.length < LIMITS.titleMin) return { ok: false, error: `Write a question of at least ${LIMITS.titleMin} characters.` };
  if (title.length > LIMITS.titleMax) return { ok: false, error: `Keep the question under ${LIMITS.titleMax} characters.` };
  if (body.length > LIMITS.bodyMax) return { ok: false, error: `Keep the details under ${LIMITS.bodyMax} characters.` };
  if (!isCommunityCity(city)) return { ok: false, error: "Pick a city." };
  if (!isCommunityTopic(topic)) return { ok: false, error: "Pick a topic." };
  const contact = checkContact(`${title}\n${body}`);
  if (contact) return { ok: false, error: contact };
  return { ok: true, value: { title, body, city, topic } };
}

export function checkAnswer(body: unknown): TextVerdict {
  const value = clean(body);
  if (value.length < LIMITS.answerMin) return { ok: false, error: "Write an answer first." };
  if (value.length > LIMITS.bodyMax) return { ok: false, error: `Keep the answer under ${LIMITS.bodyMax} characters.` };
  const contact = checkContact(value);
  return contact ? { ok: false, error: contact } : { ok: true, value };
}

export function authorName(user: { firstName: string | null; username: string | null } | null): string {
  const name = (user?.firstName || user?.username || "").trim();
  return name ? name.slice(0, 40) : "Traveller";
}

/** A spot tip: short text plus an optional visit date between two years ago and today (UTC). */
export function checkTip(input: { body: unknown; visitedOn: unknown }, today = new Date()):
  { ok: true; value: { body: string; visitedOn: string | null } } | { ok: false; error: string } {
  const body = clean(input.body);
  if (body.length < LIMITS.tipMin) return { ok: false, error: "Write a tip first." };
  if (body.length > LIMITS.tipMax) return { ok: false, error: `Keep the tip under ${LIMITS.tipMax} characters.` };
  const contact = checkContact(body);
  if (contact) return { ok: false, error: contact };
  const visited = typeof input.visitedOn === "string" ? input.visitedOn.trim() : "";
  if (!visited) return { ok: true, value: { body, visitedOn: null } };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(visited) ? new Date(`${visited}T00:00:00Z`) : null;
  const max = today.toISOString().slice(0, 10);
  const min = new Date(today.getTime() - 730 * 86400000).toISOString().slice(0, 10);
  if (!day || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== visited || visited > max || visited < min) {
    return { ok: false, error: "Pick the day you visited (within the last two years)." };
  }
  return { ok: true, value: { body, visitedOn: visited } };
}

const DAY = 86400000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function parseDay(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && isoDay(date) === value ? value : null;
}

/** "2026-W44" for a day (ISO 8601: weeks start Monday; week 1 holds the first Thursday). */
export function isoWeek(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  const thursday = new Date(date.getTime() + (3 - weekday) * DAY);
  const year = thursday.getUTCFullYear();
  const week = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Monday and Sunday of an ISO week, or null for a malformed week. */
export function weekRange(week: string): { from: string; to: string } | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!match) return null;
  const year = Number(match[1]), number = Number(match[2]);
  if (number < 1 || number > 53) return null;
  const jan4 = Date.UTC(year, 0, 4);
  const monday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + (number - 1) * 7 * DAY;
  const from = isoDay(new Date(monday));
  return isoWeek(from) === week ? { from, to: isoDay(new Date(monday + 6 * DAY)) } : null;
}

export function shiftWeek(week: string, by: number): string {
  const range = weekRange(week);
  return range ? isoWeek(isoDay(new Date(Date.parse(`${range.from}T00:00:00Z`) + by * 7 * DAY))) : week;
}

/** A "travelling now" trip: not over yet, starts within a year, at most 60 days, short note without contact details. */
export function checkTrip(input: { city: unknown; from: unknown; to: unknown; note: unknown }, today = new Date()):
  { ok: true; value: { city: string; from: string; to: string; note: string } } | { ok: false; error: string } {
  const city = typeof input.city === "string" ? input.city : "";
  if (!isCommunityCity(city)) return { ok: false, error: "Pick a city." };
  const from = parseDay(input.from), to = parseDay(input.to);
  if (!from || !to) return { ok: false, error: "Pick your arrival and departure days." };
  const now = isoDay(today);
  if (to < from) return { ok: false, error: "Departure must be on or after arrival." };
  if (to < now) return { ok: false, error: "This trip is already over." };
  if (from > isoDay(new Date(today.getTime() + 365 * DAY))) return { ok: false, error: "Add trips that start within a year." };
  if ((Date.parse(to) - Date.parse(from)) / DAY > 60) return { ok: false, error: "Keep one stay to 60 days or less." };
  const note = clean(input.note).replace(/\n/g, " ");
  if (note.length > 140) return { ok: false, error: "Keep the note under 140 characters." };
  const contact = checkContact(note);
  if (contact) return { ok: false, error: contact };
  return { ok: true, value: { city, from, to, note } };
}
