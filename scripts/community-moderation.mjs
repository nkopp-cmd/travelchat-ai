// AI pre-filter for Localley community content (shared/plans/localley-helper-community.md, Moderation item).
// Back-office job on the agent host (HYBRID RULE: runs by itself -> own server), every 10 minutes from cron:
//   flock -n ~/.local/state/localley/community-moderation.lock node scripts/community-moderation.mjs [--dry-run] [--limit N]
// Reads unreviewed rows from the production D1 (REST API), asks `codex exec` on the ChatGPT subscription for an
// allow/hide verdict (subscription-first: never behind a public endpoint, no paid API), hides "hide" rows and records
// verdict + reason. A row without a valid verdict stays unreviewed and is retried. After 3 failed runs in a row it
// messages Nils once (shared/scripts/notify.sh) and leaves content visible.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACCOUNT = "664f242340bcec2f32daaeee15f58bde";
const DATABASE = "f1cc916b-5606-443f-9c4f-695c4ccc4a63"; // localley-app (production)
const BUCKET = "localley-community-media";
const STATE = join(homedir(), ".local/state/localley/community-moderation.json");
const NOTIFY = "/home/dev/projects/CyberLink/shared/scripts/notify.sh";

export const SOURCES = [
  { kind: "question", table: "community_questions", text: "title || char(10) || body", photo: "NULL" },
  { kind: "answer", table: "community_answers", text: "body", photo: "NULL" },
  { kind: "tip", table: "spot_tips", text: "body", photo: "photo_key" },
  { kind: "trip", table: "community_trips", text: "note", photo: "NULL" },
];

export const POLICY = `You moderate a travel community app for Asia (questions, answers, short spot tips with an optional photo,
"travelling now" trip notes). Decide for EACH item: "allow" or "hide".
Hide when the item contains any of: spam, advertising or self-promotion; contact details or attempts to move people off
the app (phone numbers, e-mail, social-media handles, messaging IDs, "DM me"); scams, fake ride/booking/guide offers or
requests for money; sexual content or solicitation; hate, harassment or threats; dangerous advice (unsafe medical
claims, illegal drugs, evading police, visa or customs rules); private data of other people; in photos: nudity, gore,
documents or screens with personal data, a stranger's face as the main subject.
Allow ordinary travel questions and answers, honest negative experiences, mild language, opinions and corrections.
When unsure, allow. The reason is at most 12 words, for an admin.`;

/** The prompt for one batch; photos are attached in the same order as listed here. */
export function buildPrompt(items) {
  const lines = items.map((item) => JSON.stringify({ id: item.id, kind: item.kind, text: item.text, photo: item.photoFile ? `attached image #${item.photoIndex + 1}` : null }));
  return `${POLICY}\n\nItems (${items.length}), one JSON object per line:\n${lines.join("\n")}\n\nReturn a verdict for every id.`;
}

export const SCHEMA = {
  type: "object", additionalProperties: false, required: ["verdicts"],
  properties: { verdicts: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "verdict", "reason"],
    properties: { id: { type: "string" }, verdict: { type: "string", enum: ["allow", "hide"] }, reason: { type: "string" } } } } },
};

/** Keep only well-formed verdicts for ids in this batch (first one wins); anything else is retried next run. */
export function parseVerdicts(raw, items) {
  let data;
  try { data = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)); } catch { return new Map(); }
  const ids = new Set(items.map((item) => item.id));
  const out = new Map();
  for (const v of Array.isArray(data?.verdicts) ? data.verdicts : []) {
    if (!v || typeof v.id !== "string" || !ids.has(v.id) || out.has(v.id) || !["allow", "hide"].includes(v.verdict)) continue;
    out.set(v.id, { verdict: v.verdict, reason: String(v.reason ?? "").replace(/\s+/g, " ").trim().slice(0, 140) });
  }
  return out;
}

/** D1 statements for the verdicts: only rows still unreviewed; a hidden answer recounts its question. */
export function updateStatements(items, verdicts, now = new Date().toISOString()) {
  const statements = [];
  for (const item of items) {
    const v = verdicts.get(item.id);
    if (!v) continue;
    const table = SOURCES.find((s) => s.kind === item.kind).table;
    statements.push({ sql: `UPDATE ${table} SET ai_reviewed_at = ?, ai_verdict = ?, ai_reason = ?, status = CASE WHEN ? = 'hide' THEN 'hidden' ELSE status END WHERE id = ? AND ai_reviewed_at IS NULL`,
      params: [now, v.verdict, v.reason, v.verdict, item.id] });
    if (item.kind === "answer" && v.verdict === "hide") {
      statements.push({ sql: "UPDATE community_questions SET answer_count = (SELECT count(*) FROM community_answers a WHERE a.question_id = community_questions.id AND a.status = 'visible') WHERE id = (SELECT question_id FROM community_answers WHERE id = ?)", params: [item.id] });
    }
  }
  return statements;
}

async function d1(sql, params = []) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/d1/database/${DATABASE}/query`, {
    method: "POST", headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
    body: JSON.stringify({ sql, params }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) throw new Error(`D1 query failed (${response.status})`);
  return data.result[0].results;
}

async function unreviewed(limit) {
  const items = [];
  for (const source of SOURCES) {
    if (items.length >= limit) break;
    const rows = await d1(`SELECT id, ${source.text} AS text, ${source.photo} AS photo_key FROM ${source.table} WHERE ai_reviewed_at IS NULL ORDER BY created_at LIMIT ?`, [limit - items.length]);
    for (const row of rows) items.push({ kind: source.kind, id: row.id, text: String(row.text ?? "").slice(0, 2200), photoKey: row.photo_key || null });
  }
  return items;
}

function readState() {
  try { return JSON.parse(readFileSync(STATE, "utf8")); } catch { return { consecutiveFailures: 0, notified: false }; }
}
function writeState(state) {
  mkdirSync(join(homedir(), ".local/state/localley"), { recursive: true });
  writeFileSync(STATE, JSON.stringify({ ...state, at: new Date().toISOString() }));
}

async function run({ dryRun, limit }) {
  const items = await unreviewed(limit);
  if (!items.length) return { reviewed: 0, hidden: 0 };
  const dir = mkdtempSync(join(tmpdir(), "community-moderation-"));
  try {
    const images = [];
    for (const item of items.filter((i) => i.photoKey)) {
      const file = join(dir, `${images.length + 1}.webp`);
      execFileSync("npx", ["wrangler", "r2", "object", "get", `${BUCKET}/${item.photoKey}`, "--jurisdiction", "eu", "--remote", "--file", file],
        { stdio: "ignore", env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: ACCOUNT } });
      if (existsSync(file)) { item.photoFile = file; item.photoIndex = images.length; images.push(file); }
    }
    writeFileSync(join(dir, "schema.json"), JSON.stringify(SCHEMA));
    const out = join(dir, "verdicts.json");
    execFileSync("codex", ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "--output-schema", join(dir, "schema.json"), "-o", out,
      ...images.flatMap((file) => ["-i", file]), buildPrompt(items)], { stdio: ["ignore", "ignore", "pipe"], timeout: 600000 });
    const verdicts = parseVerdicts(readFileSync(out, "utf8"), items);
    const statements = updateStatements(items, verdicts);
    if (!dryRun) for (const s of statements) await d1(s.sql, s.params);
    const hidden = [...verdicts.values()].filter((v) => v.verdict === "hide").length;
    return { reviewed: verdicts.size, hidden, pending: items.length - verdicts.size, dryRun, verdicts: dryRun ? Object.fromEntries(verdicts) : undefined };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const limit = Math.min(50, Math.max(1, Number(args[args.indexOf("--limit") + 1]) || 50));
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN missing");
  const state = readState();
  try {
    const result = await run({ dryRun, limit });
    if (!dryRun) writeState({ consecutiveFailures: 0, notified: false, last: result });
    if (result.reviewed || dryRun) console.log(JSON.stringify(result));
  } catch (error) {
    const failures = (state.consecutiveFailures ?? 0) + 1;
    let notified = Boolean(state.notified);
    if (!dryRun && failures >= 3 && !notified) {
      try { execFileSync(NOTIFY, [`Localley community moderation failed ${failures} runs in a row (${error.message}). New posts stay visible until it recovers.`], { stdio: "ignore" }); notified = true; } catch { /* retry next run */ }
    }
    if (!dryRun) writeState({ consecutiveFailures: failures, notified });
    console.error(`community moderation failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
