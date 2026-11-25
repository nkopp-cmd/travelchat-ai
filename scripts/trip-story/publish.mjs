#!/usr/bin/env node
// Trip-story plan T5: turn the newest posted TikTok carousel trip into a blog post, without a person in the loop.
//   draft  fresh worktree from origin/main -> export posted trips -> pickTrip (max 2 / 7 days, one per city / 60 days,
//          one per trip) -> export --derive (R2 images) -> write.mjs (ChatGPT subscription) -> blog checks -> commit ->
//          push -> READY PR (no hold: PRIME RULE 4, publish at once) -> Telegram preview -> state file.
//          The delivery autopilot merges it when green; the Gravity release lane deploys the merge.
//   live   for each drafted post: when the live sha holds it -> live check, content-check, IndexNow, mark-deployed,
//          Telegram "live" line. A post not live after 3 days is reported once and dropped from the state.
// Nils' "no trip <slug>" reply (telegram-inbox) blocks it: an agent closes the PR or removes the post.
// Exit codes: 0 done or nothing to do, 1 failed, 2 no post today (caps or no trip).
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HOST, holdsPost, liveCheck, ping } from "../weekly-post-publish.mjs";
import { pickTrip, previewText, tripPostInfo } from "./publish-lib.mjs";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROOT = "/home/dev/projects/CyberLink";
const STATE = path.join(homedir(), ".local/state/localley/trip-story-publish.json");
const TESTS = ["__tests__/lib/blog.test.ts", "__tests__/lib/blog-trip-story.test.tsx"];
const MAX_LIVE_WAIT_MS = 3 * 86_400_000;

const sh = (cmd, args, cwd, input) => {
  const result = spawnSync(cmd, args, { cwd, input, encoding: "utf8", timeout: 1_800_000, maxBuffer: 16 << 20 });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${(result.stderr || result.stdout || "").trim().slice(-400)}`);
  return result.stdout.trim();
};
const readState = () => (existsSync(STATE) ? JSON.parse(readFileSync(STATE, "utf8")) : { pending: [] });
const writeState = (state) => { mkdirSync(path.dirname(STATE), { recursive: true }); writeFileSync(STATE, `${JSON.stringify(state, null, 2)}\n`); };
const notify = (title, text) => spawnSync(`${ROOT}/shared/scripts/notify.sh`, ["--area", "Localley", "--level", "info", "--title", title],
  { input: text, encoding: "utf8", timeout: 120_000 }).status === 0;

function draft() {
  const day = new Date().toISOString().slice(0, 10);
  const branch = `content/trip-story-${day}`;
  const tree = `${ROOT}/claude-work/worktrees/localley-trip-story-${day}`;
  sh("git", ["fetch", "-q", "origin", "main"], app);
  sh("git", ["worktree", "add", "-q", "-b", branch, tree, "origin/main"], app);
  const modules = `${tree}/node_modules`;
  const out = `${tree}/.trip-story-out`;
  let pushed = false;
  try {
    symlinkSync(`${app}/node_modules`, modules);
    const blogDir = `${tree}/content/blog`;
    const posts = readdirSync(blogDir).filter((f) => f.endsWith(".md"))
      .map((f) => tripPostInfo(f, readFileSync(path.join(blogDir, f), "utf8"))).filter(Boolean);
    const listed = JSON.parse(sh("node", ["scripts/trip-story/export.mjs", "--out", out], tree));
    const candidates = listed.results.filter((r) => !r.skip).map((r) => {
      const trip = JSON.parse(readFileSync(path.join(out, `${r.itineraryId}.json`), "utf8"));
      return { itineraryId: trip.itineraryId, city: trip.city, cover: trip.cover };
    });
    const { pick, reason } = pickTrip({ candidates, posts, today: day });
    if (!pick) { console.log(JSON.stringify({ post: false, reason })); return 2; }
    sh("node", ["scripts/trip-story/export.mjs", "--only", pick.itineraryId, "--derive", "--out", out], tree);
    const written = spawnSync("node", ["scripts/trip-story/write.mjs", path.join(out, `${pick.itineraryId}.json`), "--date", day],
      { cwd: tree, encoding: "utf8", timeout: 1_800_000 });
    if (written.status !== 0) {
      console.log(JSON.stringify({ post: false, itineraryId: pick.itineraryId, reason: (written.stderr || "").trim().split("\n").pop() }));
      return written.status === 2 || written.status === 3 ? 2 : 1;
    }
    const file = written.stdout.trim().split("\n").pop();
    sh("node", ["scripts/blog-index.mjs", "--check"], tree);
    const env = { ...process.env };
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "DATA_BACKEND"]) delete env[k];
    const tests = spawnSync("npx", ["vitest", "run", ...TESTS], { cwd: tree, env, encoding: "utf8", timeout: 900_000 });
    if (tests.status !== 0) throw new Error(`blog tests failed: ${(tests.stdout || "").trim().slice(-400)}`);
    rmSync(modules);
    rmSync(out, { recursive: true, force: true });
    const slug = path.basename(file, ".md").slice(11);
    const source = readFileSync(path.join(tree, file), "utf8");
    const title = /\ntitle: (.+)\n/.exec(source)?.[1] ?? slug;
    sh("git", ["add", "content/blog", "lib/blog/posts.generated.json"], tree);
    sh("git", ["commit", "-q", "-F", "-"], tree, `[builder] blog: trip story ${slug}\n\nTrip-story T5 automation: posted carousel trip ${pick.itineraryId} (${pick.city}), prose on the subscription from spot rows only; blog checks passed.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`);
    sh("git", ["push", "-q", "-u", "origin", branch], tree);
    pushed = true;
    const pr = sh("gh", ["pr", "create", "--title", `[builder] blog: trip story ${slug}`, "--body",
      `Trip-story post from carousel trip \`${pick.itineraryId}\` (${pick.city}): \`${file}\`. Made by \`scripts/trip-story/publish.mjs draft\` (T5). Publishes at once (PRIME RULE 4); Nils gets the Telegram preview, his "no" blocks it.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`], tree);
    const state = readState();
    state.pending.push({ slug, title, pr, at: new Date().toISOString() });
    writeState(state);
    const sent = notify(`Trip story: ${slug}`, previewText({ slug, pr, title, source }));
    console.log(JSON.stringify({ post: true, slug, pr, preview: sent ? "sent" : "send failed" }));
    return 0;
  } finally {
    if (existsSync(modules)) rmSync(modules);
    rmSync(out, { recursive: true, force: true });
    // The branch lives on in origin (pushed) and the PR; the scratch worktree goes. Unpushed failures keep nothing.
    spawnSync("git", ["worktree", "remove", "--force", tree], { cwd: app });
    if (!pushed) spawnSync("git", ["branch", "-D", branch], { cwd: app });
  }
}

async function live() {
  const state = readState();
  if (!state.pending.length) return 0;
  const version = await (await fetch(`https://${HOST}/api/version?t=${Date.now()}`)).json();
  sh("git", ["fetch", "-q", "origin", "main"], app);
  const listing = sh("git", ["ls-tree", "--name-only", version.sha, "content/blog/"], app);
  let failed = false;
  const keep = [];
  for (const item of state.pending) {
    if (Date.now() - Date.parse(item.at) > MAX_LIVE_WAIT_MS) {
      notify(`Trip story not live: ${item.slug}`, `The trip-story post ${item.slug} failed to go live in 3 days. PR: ${item.pr}`);
      continue;
    }
    if (!holdsPost(listing, item.slug)) { keep.push(item); continue; }
    const fail = await liveCheck(item.slug, item.title);
    const url = `https://${HOST}/blog/${item.slug}`;
    const content = spawnSync("node", [`${ROOT}/shared/scripts/content-check.mjs`, url], { encoding: "utf8", timeout: 120_000 });
    if (content.status !== 0) fail.push(`content-check: ${(content.stdout || content.stderr || "").trim().slice(-300)}`);
    if (fail.length) { failed = true; keep.push(item); console.log(JSON.stringify({ slug: item.slug, live: false, fail })); continue; }
    const status = await ping([url, `https://${HOST}/blog`]);
    sh(`${ROOT}/shared/scripts/mark-deployed`, ["Localley"], app);
    notify(`Trip story live: ${item.slug}`, `Live: ${url}\nReply "no trip ${item.slug}" to unpublish it.\nOptional (T6): set the TikTok bio link to ${url} so viewers of the carousel find the full plan.`);
    console.log(JSON.stringify({ slug: item.slug, live: true, indexnow: status }));
  }
  writeState({ ...state, pending: keep });
  return failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stage] = process.argv.slice(2);
  process.exitCode = stage === "draft" ? draft() : stage === "live" ? await live()
    : (console.log("usage: publish.mjs draft | live"), 2);
}
