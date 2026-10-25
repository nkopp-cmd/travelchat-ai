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
  { id: "other", label: "Other" },
] as const;

export type CommunityTopic = (typeof COMMUNITY_TOPICS)[number]["id"];
export const REPORT_REASONS = ["spam", "abuse", "unsafe", "wrong", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Per-user daily posting limits, checked against the tables (fail closed, no extra binding). */
export const DAILY_LIMITS = { question: 10, answer: 40, tip: 20 } as const;

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
