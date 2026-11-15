import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { EDGE_HTML_TTL_SECONDS, PER_VISITOR_COOKIES } from "@/cloudflare/opennext/edge-html-cache";

// The edge HTML cache key ignores cookies. A cached page whose own server code reads cookies() or
// headers() renders one visitor's data into the shared entry (the d747541 leak, 2026-11-15) unless the
// path is in PER_VISITOR_COOKIES, which sends those visitors past the cache.
const APP = join(process.cwd(), "app");

function pageFiles(dir = APP): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name.startsWith("api") && dir === APP ? [] : pageFiles(path);
    return name === "page.tsx" ? [path] : [];
  });
}

/** URL segments of a page file: route groups drop out, [x] / [[...x]] match any segment. */
function matches(file: string, pathname: string): boolean {
  const segs = relative(APP, file).split("/").slice(0, -1).filter((s) => !/^\(.+\)$/.test(s));
  const want = pathname.split("/").filter(Boolean);
  if (segs.at(-1)?.startsWith("[[...")) return want.length >= segs.length - 1 && segs.slice(0, -1).every((s, i) => s === want[i]);
  return segs.length === want.length && segs.every((s, i) => s.startsWith("[") || s === want[i]);
}

const SERVER_SOURCE = /\.(ts|tsx)$/;
/** The page's own folder: page, layout and co-located server components ("use client" files excluded). */
function readsRequestState(page: string): string[] {
  const dir = join(page, "..");
  return readdirSync(dir)
    .filter((name) => SERVER_SOURCE.test(name) && !statSync(join(dir, name)).isDirectory())
    .map((name) => join(dir, name))
    .filter((file) => {
      const src = readFileSync(file, "utf8");
      if (/^\s*["']use client["']/.test(src)) return false;
      return src.includes("next/headers") && /\b(cookies|headers)\(\s*\)/.test(src);
    })
    .map((file) => relative(process.cwd(), file));
}

const cachedPages = Object.keys(EDGE_HTML_TTL_SECONDS).filter((p) => !p.startsWith("/api/"));
const pages = pageFiles();
// Exact page first, then the dynamic one ("/newsletter/thanks" -> newsletter/[state]).
const pageFor = (pathname: string) =>
  pages.filter((f) => matches(f, pathname)).sort((a, b) => (a.includes("[") ? 1 : 0) - (b.includes("[") ? 1 : 0))[0];

describe("edge HTML cache: per-visitor pages bypass the shared entry (push O, 2026-11-15)", () => {
  it("finds a page file for every cached HTML path", () => {
    expect(cachedPages.filter((p) => !pageFor(p))).toEqual([]);
  });

  it("the scanner sees the preview page's cookie read (control)", () => {
    expect(readsRequestState(pageFor("/itineraries/preview")).length).toBeGreaterThan(0);
  });

  it("lists every cached page that reads cookies() or headers() in PER_VISITOR_COOKIES", () => {
    const unguarded = cachedPages
      .filter((p) => !Object.hasOwn(PER_VISITOR_COOKIES, p))
      .map((p) => ({ path: p, reads: readsRequestState(pageFor(p)) }))
      .filter((x) => x.reads.length > 0);
    expect(unguarded).toEqual([]);
  });
});
