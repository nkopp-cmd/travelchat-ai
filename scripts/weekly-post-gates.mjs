// Weekly blog gates (shared/plans/weekly-blog.md item 5). Code only, no model. A post goes live only when
// every gate passes; a failed gate means no post this week (exit 1) and one line in the plan.
//   node scripts/weekly-post-gates.mjs content/blog/<yyyy-mm-dd>-<slug>.md
// Gates: content-check (shared/scripts/content-check.mjs analyse() on the post text), fact match (every
// number in the post exists in the fact rows, plus the drafter's structure checks), no duplicate title or
// slug with an existing post. perf-check runs on the live URL after the release (go live always).
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLOG_DIR, POST_FILE, blogFiles } from "./blog-index.mjs";
import { checkDraft, factsFor } from "./weekly-post-draft.mjs";
import { helpCandidates } from "./weekly-post-topic.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// The CyberLink root checkout (app worktrees live elsewhere); CONTENT_CHECK overrides it.
const CONTENT_CHECK = process.env.CONTENT_CHECK ?? "/home/dev/projects/CyberLink/shared/scripts/content-check.mjs";

/** Front matter fields and body of a post file. */
export function splitPost(source) {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (!m) return null;
  const meta = Object.fromEntries(m[1].split("\n").map((l) => {
    const i = l.indexOf(":");
    return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  }));
  return { meta, body: m[2] };
}

/** Reader-visible text of a Markdown body (what content-check reads on the page). */
export function plainText(body) {
  return body
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|[-*]|\d+\.)\s+/gm, "")
    .replace(/^\|?\s*:?-{3,}.*$/gm, "")
    .replace(/[*_`|]/g, " ");
}

const normTitle = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Runs all gates on one post. `others` = [{file, source}] of the other posts. Returns failed gates. */
export function runGates({ file, source, others, data, analyse }) {
  const failed = [];
  const name = POST_FILE.exec(file);
  const post = splitPost(source);
  if (!name || !post) return ["file name or front matter"];
  const slug = name[2];

  const text = [post.meta.title, post.meta.description, plainText(post.body)].join("\n");
  const content = analyse(text);
  if (!content.ok) failed.push(`content-check: meta ${(content.ratio * 100).toFixed(0)} %, banned ${content.banned.join(" | ") || "-"}`);

  const topic = helpCandidates(data.pay, data.phrases).find((t) => t.slug === slug);
  const facts = topic && factsFor(topic, data);
  if (!facts) failed.push(`fact match: no fact rows for ${slug}`);
  else {
    const problems = checkDraft({ description: post.meta.description, body: post.body }, facts);
    if (problems.length) failed.push(`fact match: ${problems.join("; ")}`);
  }

  for (const other of others) {
    if (other.file === file) continue;
    const o = splitPost(other.source);
    if (POST_FILE.exec(other.file)[2] === slug) failed.push(`duplicate slug ${other.file}`);
    if (o && normTitle(o.meta.title ?? "") === normTitle(post.meta.title ?? "")) failed.push(`duplicate title ${other.file}`);
  }
  return failed;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const target = process.argv[2];
  if (!target) throw new Error("usage: weekly-post-gates.mjs content/blog/<file>.md");
  const read = (p) => JSON.parse(readFileSync(path.join(root, p), "utf8"));
  const data = { pay: read("lib/help/pay.json"), phrases: read("lib/help/source.json"), translations: read("lib/help/translations.json") };
  const { analyse } = await import(CONTENT_CHECK);
  const others = blogFiles(BLOG_DIR).map((f) => ({ file: f, source: readFileSync(path.join(BLOG_DIR, f), "utf8") }));
  const file = path.basename(target);
  const failed = runGates({ file, source: readFileSync(target, "utf8"), others, data, analyse });
  for (const f of failed) console.error(`gate failed: ${f}`);
  if (failed.length) process.exit(1);
  console.log(`gates ok: ${file}`);
}
