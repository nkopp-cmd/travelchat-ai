// Weekly blog publish (shared/plans/weekly-blog.md item 6; go live always, Nils' own content).
//   draft        fresh worktree from origin/main -> weekly-post-draft (subscription) -> weekly-post-gates ->
//                bundle check -> blog tests -> commit -> push -> READY PR. The delivery autopilot merges it when green;
//                the Gravity release lane deploys the merge.
//   live <slug>  (after the lane deployed it) live sha must hold the post -> live check of the post, /blog, RSS,
//                sitemap and the IndexNow key file -> IndexNow ping (Bing, Yandex, Seznam share it) -> mark-deployed.
// Exit codes: 0 done, 1 failed, 2 no post this week (draft) / usage, 3 the post is not deployed yet (retry later).
// The IndexNow key is public by design: public/<key>.txt holds it so the engines can verify the host.
import { spawnSync } from "node:child_process";
import { existsSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { splitPost } from "./weekly-post-gates.mjs";

export const HOST = "www.localley.io";
export const INDEXNOW_KEY = "e33fedf5a3e7571e843ed32dacfa891e";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = "/home/dev/projects/CyberLink";
const BLOG_TESTS = ["blog", "weekly-post-topic", "weekly-post-draft", "weekly-post-gates", "weekly-post-publish"]
  .map((name) => `__tests__/lib/${name}.test.ts`);

export const indexNowBody = (urls) => ({ host: HOST, key: INDEXNOW_KEY, keyLocation: `https://${HOST}/${INDEXNOW_KEY}.txt`, urlList: urls });

// React escapes these in text; the post page must carry its own title.
export const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

/** True for content/blog/<date>-<slug>.md; holdsPost reads a `git ls-tree --name-only <sha> content/blog/` listing. */
export const isPostFile = (file, slug) => /^\d{4}-\d{2}-\d{2}-(.+)\.md$/.exec(path.basename(file))?.[1] === slug;
export const holdsPost = (listing, slug) => listing.split("\n").some((f) => isPostFile(f, slug));

// Every page the post touches must be live before the ping.
export async function liveCheck(slug, title, get = (url) => fetch(url, { headers: { "cache-control": "no-cache" } })) {
  const fail = [];
  const pages = [[`/blog/${slug}`, escapeHtml(title)], ["/blog", `/blog/${slug}`], ["/blog/rss.xml", `/blog/${slug}`],
    ["/sitemap.xml", `/blog/${slug}`], [`/${INDEXNOW_KEY}.txt`, INDEXNOW_KEY]];
  for (const [p, needle] of pages) {
    const response = await get(`https://${HOST}${p}`);
    const body = response.status === 200 ? await response.text() : "";
    if (!body.includes(needle)) fail.push(`${p}: ${response.status}${response.status === 200 ? ` without "${needle}"` : ""}`);
  }
  return fail;
}

export async function ping(urls, post = (url, init) => fetch(url, init)) {
  const response = await post("https://api.indexnow.org/indexnow", { method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" }, body: JSON.stringify(indexNowBody(urls)) });
  return response.status; // 200 or 202 = accepted
}

const sh = (cmd, args, cwd, input) => {
  const result = spawnSync(cmd, args, { cwd, input, encoding: "utf8", timeout: 900_000, maxBuffer: 16 << 20 });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")}: ${(result.stderr || result.stdout || "").trim().slice(-400)}`);
  return result.stdout.trim();
};

function draft() {
  const day = new Date().toISOString().slice(0, 10);
  const branch = `blog/localley-${day}`;
  const tree = `${ROOT}/claude-work/worktrees/localley-post-${day}`;
  sh("git", ["fetch", "-q", "origin", "main"], app);
  sh("git", ["worktree", "add", "-q", "-b", branch, tree, "origin/main"], app);
  const modules = `${tree}/node_modules`;
  try {
    symlinkSync(`${app}/node_modules`, modules);
    const result = spawnSync("node", ["scripts/weekly-post-draft.mjs", "--date", day], { cwd: tree, encoding: "utf8", timeout: 1_800_000 });
    const file = result.stdout.trim().split("\n").pop();
    if (result.status !== 0) {
      console.log(JSON.stringify({ post: false, reason: (result.stderr || "").trim().split("\n").pop() }));
      return result.status === 2 ? 2 : 1;
    }
    sh("node", ["scripts/weekly-post-gates.mjs", file], tree);
    sh("node", ["scripts/blog-index.mjs", "--check"], tree);
    const env = { ...process.env };
    for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "DATA_BACKEND"]) delete env[k];
    const tests = spawnSync("npx", ["vitest", "run", ...BLOG_TESTS], { cwd: tree, env, encoding: "utf8", timeout: 900_000 });
    if (tests.status !== 0) throw new Error(`blog tests failed: ${(tests.stdout || "").trim().slice(-400)}`);
    rmSync(modules);
    const slug = path.basename(file, ".md").slice(11);
    sh("git", ["add", "content/blog", "lib/blog/posts.generated.json"], tree);
    sh("git", ["commit", "-q", "-F", "-"], tree, `[builder] blog: ${slug} (weekly post ${day})\n\nDrafted on the subscription from lib/help fact rows; all weekly-post gates passed.\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n`);
    sh("git", ["push", "-q", "-u", "origin", branch], tree);
    const pr = sh("gh", ["pr", "create", "--title", `[builder] blog: ${slug}`, "--body",
      `Weekly post ${day}: \`${file}\`. Gates passed (weekly-post-gates.mjs). After the release lane deploys the merge: \`node scripts/weekly-post-publish.mjs live ${slug}\`.\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`], tree);
    console.log(JSON.stringify({ post: true, slug, pr }));
    return 0;
  } finally {
    if (existsSync(modules)) rmSync(modules);
  }
}

async function live(slug) {
  const version = await (await fetch(`https://${HOST}/api/version?t=${Date.now()}`)).json();
  sh("git", ["fetch", "-q", "origin", "main"], app);
  if (!holdsPost(sh("git", ["ls-tree", "--name-only", version.sha, "content/blog/"], app), slug)) {
    console.log(JSON.stringify({ slug, live: false, reason: `live ${version.sha.slice(0, 7)} has no post ${slug} yet` }));
    return 3;
  }
  const bundle = JSON.parse(sh("git", ["show", `${version.sha}:lib/blog/posts.generated.json`], app));
  const { meta } = splitPost(bundle.find((p) => isPostFile(p.file, slug)).source);
  const fail = await liveCheck(slug, meta.title);
  if (fail.length) return console.log(JSON.stringify({ slug, live: false, fail })), 1;
  const status = await ping([`https://${HOST}/blog/${slug}`, `https://${HOST}/blog`]);
  sh(`${ROOT}/shared/scripts/mark-deployed`, ["Localley"], app);
  console.log(JSON.stringify({ slug, live: true, indexnow: status }));
  return status === 200 || status === 202 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [stage, slug] = process.argv.slice(2);
  process.exitCode = stage === "draft" ? draft() : stage === "live" && slug ? await live(slug)
    : (console.log("usage: weekly-post-publish.mjs draft | live <slug>"), 2);
}
