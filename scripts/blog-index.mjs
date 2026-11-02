// Bundles the blog posts (content/blog/<yyyy-mm-dd>-<slug>.md) into
// lib/blog/posts.generated.json, so pages, the sitemap and the RSS route import
// them as data. The Worker has no file system; nothing reads content/ at runtime.
//   node scripts/blog-index.mjs          write the bundle
//   node scripts/blog-index.mjs --check  exit 1 when the bundle is stale (CI)
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BLOG_DIR = path.join(root, "content", "blog");
export const BLOG_BUNDLE = path.join(root, "lib", "blog", "posts.generated.json");
export const POST_FILE = /^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/;

/** Post files, newest first. */
export function blogFiles(dir = BLOG_DIR) {
  return readdirSync(dir).filter((f) => f.endsWith(".md")).sort().reverse().map((file) => {
    if (!POST_FILE.test(file)) throw new Error(`${file}: name must be <yyyy-mm-dd>-<slug>.md`);
    return file;
  });
}

/** Static asset path of each post page ("/blog/<slug>" -> "blog/<slug>.html"). */
export function blogSlugs(dir = BLOG_DIR) {
  return blogFiles(dir).map((file) => POST_FILE.exec(file)[2]);
}

export function renderBundle(dir = BLOG_DIR) {
  const posts = blogFiles(dir).map((file) => ({ file, source: readFileSync(path.join(dir, file), "utf8") }));
  return `${JSON.stringify(posts, null, 2)}\n`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const next = renderBundle();
  if (process.argv.includes("--check")) {
    if (readFileSync(BLOG_BUNDLE, "utf8") !== next) {
      console.error("lib/blog/posts.generated.json is stale: run node scripts/blog-index.mjs");
      process.exit(1);
    }
    console.log("blog bundle up to date");
  } else {
    writeFileSync(BLOG_BUNDLE, next);
    console.log(`blog bundle: ${JSON.parse(next).length} post(s)`);
  }
}
