import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error build script without types
import { DEFER_FALLBACK_MS, deferChunkScripts, loaderScript } from "../scripts/cf-defer-scripts.mjs";

const HERO = '<img src="/h.webp" fetchpriority="high" class="ll-hero-poster">';
const page = (body: string) =>
  `<!DOCTYPE html><html><head><link rel="preload" as="script" fetchPriority="low" href="/_next/static/chunks/a.js"/>`
  + `<link rel="preload" href="/_next/static/chunks/lazy.js" as="script" fetchPriority="low"/>`
  + `<link rel="preload" as="image" href="/h.webp"/><script src="/_next/static/chunks/a.js" async=""></script></head>`
  + `<body>${body}<script src="/_next/static/chunks/b.js" async=""></script>`
  + `<script src="/_next/static/chunks/poly.js" noModule=""></script><script>self.__next_f=[]</script></body></html>`;

describe("deferChunkScripts", () => {
  it("moves chunk scripts and script preloads into the post-hero loader, in order", () => {
    const out: string = deferChunkScripts(page(HERO));
    expect(out).not.toMatch(/<script src="\/_next\/static\/chunks\/(a|b)\.js"/);
    expect(out).not.toMatch(/<link[^>]*as="script"/);
    expect(out).toContain('<link rel="preload" as="image" href="/h.webp"/>');
    expect(out).toContain('<script src="/_next/static/chunks/poly.js" noModule=""></script>');
    expect(out).toContain("<script>self.__next_f=[]</script>");
    expect(out).toContain('var S=["/_next/static/chunks/a.js","/_next/static/chunks/b.js"],P=["/_next/static/chunks/lazy.js"]');
    expect(out.indexOf("var S=")).toBeGreaterThan(out.indexOf("ll-hero-poster"));
  });

  it("leaves pages without the hero or without chunks unchanged", () => {
    expect(deferChunkScripts(page("<p>no hero</p>"))).toBe(page("<p>no hero</p>"));
    const bare = `<html><body>${HERO}</body></html>`;
    expect(deferChunkScripts(bare)).toBe(bare);
  });

  it("escapes < in chunk urls so the list cannot close the script", () => {
    expect(loaderScript(["/_next/static/x</script>.js"], [])).not.toContain("x</script>");
  });
});

describe("loader in the browser", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  const run = (complete: boolean) => {
    document.body.innerHTML = HERO;
    const img = document.querySelector("img")!;
    Object.defineProperty(img, "complete", { value: complete });
    const code = loaderScript(["/_next/static/chunks/a.js", "/_next/static/chunks/b.js"], ["/_next/static/chunks/lazy.js"])
      .replace(/^<script>|<\/script>$/g, "");
    new Function(code)();
    return img;
  };
  const added = () => [...document.head.querySelectorAll("script")].map((s) => s.getAttribute("src"));

  it("adds the chunks after the hero loads and one frame paints, exactly once", () => {
    vi.useFakeTimers();
    const img = run(false);
    vi.advanceTimersByTime(100);
    expect(added()).toEqual([]);
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(50);
    expect(added()).toEqual(["/_next/static/chunks/a.js", "/_next/static/chunks/b.js"]);
    expect(document.head.querySelector('link[rel="preload"]')?.getAttribute("href")).toBe("/_next/static/chunks/lazy.js");
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(DEFER_FALLBACK_MS);
    expect(added()).toHaveLength(2);
  });

  it("starts at the first input or after the fallback when the hero never loads", () => {
    vi.useFakeTimers();
    run(false);
    window.dispatchEvent(new Event("keydown"));
    expect(added()).toHaveLength(2);
    document.head.innerHTML = "";
    run(false);
    vi.advanceTimersByTime(DEFER_FALLBACK_MS - 1);
    expect(added()).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(added()).toHaveLength(2);
  });

  it("starts right after the next frame when the hero is already decoded", () => {
    vi.useFakeTimers();
    run(true);
    vi.advanceTimersByTime(50);
    expect(added()).toHaveLength(2);
  });
});
