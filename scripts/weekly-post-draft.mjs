// Weekly blog draft (shared/plans/weekly-blog.md item 4). Runs on the ChatGPT SUBSCRIPTION through
// `codex exec` (never a metered API; nothing goes into SPEND.md). The model sees only our fact rows
// (lib/help data); the draft is checked in code and written to content/blog/<date>-<slug>.md (and the bundle)
// only when it passes. A person reviews the file in the PR; nothing here publishes.
//   node scripts/weekly-post-draft.mjs [--date YYYY-MM-DD] [--slug <topic slug>] [--out <dir>] [--dry-run]
// --dry-run prints the chosen topic, its facts and the prompt; it calls nothing.
// Exit codes: 0 written, 2 no topic with facts or the draft failed its checks twice (no post this week).
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLOG_BUNDLE, BLOG_DIR, blogFiles, renderBundle } from "./blog-index.mjs";
import { COUNTRIES, rankTopics } from "./weekly-post-topic.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CODEX = "/home/dev/.local/bin/codex"; // cron has no interactive PATH
const MODEL = "gpt-6-luna";
export const MAX_ATTEMPTS = 2;
export const WORDS = { min: 700, max: 1500 };

// Phrases that read as machine text or leak our pipeline; a draft with one is rejected.
export const TELL = [
  /\bdelve/i, /\btapestry\b/i, /\bnestled\b/i, /\bbustling\b/i, /\bvibrant\b/i, /hidden gem/i, /in conclusion/i,
  /whether you'?re/i, /\bembark\b/i, /\bseamless(ly)?\b/i, /look no further/i, /as an ai\b/i, /\bfact rows?\b/i,
  /\bpipeline\b/i, /\bdataset\b/i, /\bthe data (says|shows)\b/i, /\beditorial estimate\b/i,
];
const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []);

/** Fact lines, source URLs and the check date for a topic, or null when we hold no facts for it. */
export function factsFor(topic, { pay, phrases, translations }) {
  const meta = COUNTRIES[topic.country];
  if (topic.kind === "pay" && pay.countries[topic.country]) {
    const c = pay.countries[topic.country];
    const lines = ["cards", "cash", "transit", "atm", "qr_wallets", "tipping"]
      .flatMap((k) => asList(c[k]).map((line) => `${k}: ${line}`));
    return { lines, sources: asList(c.sources), checkedAt: pay.checkedAt, link: topic.link };
  }
  if (topic.kind === "phrases" && meta?.lang) {
    const cat = phrases.categories.find((c) => c.id === topic.category);
    const lines = (cat?.phrases ?? []).flatMap((p) => {
      const t = translations[p.id]?.[meta.lang];
      return t ? [`"${p.en}" = ${t.text} (${t.roman})`] : [];
    });
    return lines.length ? { lines, sources: [], checkedAt: null, link: topic.link } : null;
  }
  return null;
}

export function buildPrompt(topic, facts, date) {
  return [
    `Write a blog post for Localley (www.localley.io), a local-first travel planner for Asia. Today is ${date}.`,
    `Title (fixed): ${topic.title}`,
    `City: ${COUNTRIES[topic.country].city}. Reader: a first-time visitor planning the trip.`,
    "",
    "Use ONLY the facts below. Do not add any other number, price, date, name or claim. If a fact is missing, leave the point out.",
    facts.checkedAt ? `The facts were checked on ${facts.checkedAt}; say "as of ${facts.checkedAt.slice(0, 7)}" once where prices or rules appear.` : "",
    "FACTS:",
    ...facts.lines.map((l) => `- ${l}`),
    "",
    "Rules for the body (Markdown):",
    `- ${WORDS.min}-${WORDS.max} words; aim for about 1000. Explain each fact: what the visitor does, where, and what to avoid. Plain, friendly, concrete English. Short paragraphs.`,
    "- The first two sentences answer the title directly.",
    "- One `## ` heading per sub-question a visitor has. At least 3 such headings.",
    "- A `## FAQ` section with 3-5 `### ` questions, each answered in 1-3 sentences.",
    "- Allowed Markdown: ## and ### headings, paragraphs, - lists, 1. lists, **bold**, pipe tables with a --- rule line, [text](url) links.",
    `- Link once to ${facts.link} and once to /itineraries/new?city=${encodeURIComponent(COUNTRIES[topic.country].city)} with natural anchor text.`,
    facts.sources.length ? "- End with `## Sources` as a - list of these URLs only:\n" + facts.sources.map((u) => `  ${u}`).join("\n") : "- Do not add a Sources section.",
    "- No H1, no front matter, no emoji, no mention of AI, data files or how the post was made.",
    "",
    'Reply as JSON: {"description": "<one sentence, 120-160 characters, for search results>", "body": "<the Markdown body>"}',
  ].filter((l) => l !== "").join("\n");
}

const NUMBER = /\d[\d,.]*\d|\d/g;
const norm = (n) => n.replace(/[,.]+$/, "").replace(/,/g, "");

/** Code checks on a draft. Returns a list of problems (empty = pass). */
export function checkDraft({ description, body }, facts) {
  const problems = [];
  if (typeof description !== "string" || description.length < 80 || description.length > 200) problems.push("description length");
  if (typeof body !== "string") return [...problems, "no body"];
  const words = body.replace(/\]\([^)]*\)/g, "]").split(/\s+/).filter((w) => /\w/.test(w)).length;
  if (words < WORDS.min || words > WORDS.max) problems.push(`words ${words}`);
  if (/^# /m.test(body) || /^---$/m.test(body.split("\n")[0])) problems.push("h1 or front matter");
  if ((body.match(/^## /gm) ?? []).length < 4) problems.push("fewer than 3 sub-question headings + FAQ");
  if (!/^## FAQ\s*$/m.test(body)) problems.push("no FAQ");
  if (facts.sources.length && !/^## Sources\s*$/m.test(body)) problems.push("no Sources");
  for (const re of TELL) if (re.test(body) || re.test(description)) problems.push(`tell ${re.source}`);
  for (const [, href] of body.matchAll(/\]\(([^)]+)\)/g)) {
    if (!href.startsWith("/") && !facts.sources.includes(href)) problems.push(`link ${href}`);
  }
  if (!body.includes(`](${facts.link})`)) problems.push(`no link to ${facts.link}`);
  // Every number must come from the facts (dates of the check included); 1-10 may count items.
  const known = new Set((facts.lines.join(" ") + " " + (facts.checkedAt ?? "")).match(NUMBER)?.map(norm) ?? []);
  if (facts.checkedAt) known.add(facts.checkedAt.slice(0, 4)).add(facts.checkedAt.slice(0, 7));
  const text = body.replace(/\]\([^)]*\)/g, "]").replace(/https?:\/\/\S+/g, "") + " " + description;
  for (const n of new Set((text.match(NUMBER) ?? []).map(norm))) {
    if (!known.has(n) && !(Number(n) >= 1 && Number(n) <= 10 && /^\d+$/.test(n))) problems.push(`number ${n} not in facts`);
  }
  return problems;
}

// Models sometimes pad link targets with spaces: "[x]( /help )".
export const tidy = (d) => (typeof d?.body === "string" ? { ...d, body: d.body.replace(/\]\(\s*([^)\s]+)\s*\)/g, "]($1)") } : d);

/** The country photo used least often by the posts we already have (first in the list on a tie); undefined when none. */
export function pickPhoto(country, photos, used) {
  const list = photos?.[country] ?? [];
  const uses = (p) => used.filter((src) => src === p.photo).length;
  return list.reduce((best, p) => (best && uses(best) <= uses(p) ? best : p), undefined);
}

/** `photo:` front-matter values of the post files (content/blog/photos.json entries in use). */
export function usedPhotos(sources) {
  return sources.flatMap((src) => /^photo: (\S+)$/m.exec(src.split("\n---\n")[0])?.[1] ?? []);
}

export function postFile({ topic, date, description, body, photo }) {
  const meta = [`title: ${topic.title}`, `description: ${description.replace(/\s+/g, " ").trim()}`, `published: ${date}`, `updated: ${date}`];
  if (photo) meta.push(`photo: ${photo.photo}`, `photoAlt: ${photo.photoAlt}`, `photoSize: ${photo.photoSize}`, `photoCredit: ${photo.photoCredit}`);
  return `---\n${meta.join("\n")}\n---\n${body.trim()}\n`;
}

function runCodex(prompt) {
  const dir = mkdtempSync(path.join(tmpdir(), "localley-draft-"));
  try {
    const schema = path.join(dir, "schema.json");
    const out = path.join(dir, "out.json");
    writeFileSync(schema, JSON.stringify({
      type: "object", additionalProperties: false, required: ["description", "body"],
      properties: { description: { type: "string" }, body: { type: "string" } },
    }));
    const env = { ...process.env };
    for (const k of ["OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN", "OPENAI_BASE_URL", "OPENAI_API_BASE", "ANTHROPIC_API_KEY"]) delete env[k];
    const args = ["exec", "--ignore-user-config", "--ephemeral", "--skip-git-repo-check", "--cd", dir, "--sandbox", "read-only",
      "--model", MODEL, "--color", "never", "--output-schema", schema, "--output-last-message", out, "-c", 'web_search="disabled"'];
    for (const f of ["shell_tool", "unified_exec", "multi_agent", "skill_search", "plugins", "apps"]) args.push("--disable", f);
    const r = spawnSync(CODEX, [...args, "-"], { input: prompt, env, encoding: "utf8", timeout: 15 * 60_000 });
    if (r.status !== 0 || !existsSync(out)) throw new Error(`codex exec failed (rc=${r.status}): ${(r.stderr ?? "").slice(-300)}`);
    return JSON.parse(readFileSync(out, "utf8"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Picks the best-ranked topic we hold facts for, drafts it (max 2 attempts) and returns the post. */
export function draftPost({ date, data, files, slug, photos = {}, used = [], generate = runCodex, log = () => {} }) {
  const ranked = rankTopics({ date: new Date(`${date}T00:00:00Z`), files, ...data });
  const topic = ranked.find((t) => (slug ? t.slug === slug : true) && factsFor(t, data));
  if (!topic) return { ok: false, reason: slug ? `no facts or a recent repeat for ${slug}` : "no topic with facts" };
  const facts = factsFor(topic, data);
  const prompt = buildPrompt(topic, facts, date);
  let problems = [];
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const retry = problems.length ? `\n\nYour previous draft failed these checks: ${problems.join("; ")}. Fix all of them.` : "";
    const draft = tidy(generate(prompt + retry));
    problems = checkDraft(draft, facts);
    log(`attempt ${attempt}: ${problems.length ? problems.join("; ") : "pass"}`);
    if (!problems.length) return { ok: true, topic, file: `${date}-${topic.slug}.md`, source: postFile({ topic, date, ...draft, photo: pickPhoto(topic.country, photos, used) }) };
  }
  return { ok: false, topic, reason: problems.join("; ") };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const date = arg("--date") ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("--date must be YYYY-MM-DD");
  const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
  const data = { pay: read("lib/help/pay.json"), phrases: read("lib/help/source.json"), translations: read("lib/help/translations.json") };
  const files = blogFiles(BLOG_DIR);
  const photos = read("content/blog/photos.json");
  const used = usedPhotos(files.map((f) => readFileSync(path.join(BLOG_DIR, f), "utf8")));
  if (process.argv.includes("--dry-run")) {
    const result = draftPost({ date, data, files, slug: arg("--slug"), generate: (prompt) => { console.log(prompt); return {}; } });
    console.log(`\ntopic: ${result.topic?.slug ?? `- (${result.reason})`}`);
    process.exit(0);
  }
  const result = draftPost({ date, data, files, slug: arg("--slug"), photos, used, log: (l) => console.error(l) });
  if (!result.ok) {
    console.error(`no post: ${result.topic?.slug ?? "-"}: ${result.reason}`);
    process.exit(2);
  }
  const out = arg("--out");
  if (out) {
    writeFileSync(path.join(out, result.file), result.source);
  } else {
    writeFileSync(path.join(BLOG_DIR, result.file), result.source);
    writeFileSync(BLOG_BUNDLE, renderBundle());
  }
  console.log(path.join(out ?? "content/blog", result.file));
}
