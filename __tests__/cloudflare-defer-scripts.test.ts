import { afterEach, describe, expect, it, vi } from "vitest";
// @ts-expect-error build script without types
import { DEFER_FALLBACK_MS, deferChunkScripts, loaderScript, SPOT_HERO } from "../scripts/cf-defer-scripts.mjs";

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

  it("moves the async full stylesheets into the loader and keeps the noscript copies", () => {
    const sheet = (h: string) => `<link rel="stylesheet" href="${h}" data-precedence="next" media="print" onload="this.media='all'">`;
    const html = page(HERO).replace("<head>", `<head><style>.c{}</style>${sheet("/_next/static/css/x.css")}`
      + `<noscript><link rel="stylesheet" href="/_next/static/css/x.css"></noscript>${sheet("/_next/static/css/y.css")}`);
    const out: string = deferChunkScripts(html);
    expect(out).not.toContain('media="print"');
    expect(out).toContain('<noscript><link rel="stylesheet" href="/_next/static/css/x.css"></noscript>');
    expect(out).toContain("<style>.c{}</style>");
    expect(out).toContain('C=["/_next/static/css/x.css","/_next/static/css/y.css"]');
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
    const code = loaderScript(["/_next/static/chunks/a.js", "/_next/static/chunks/b.js"], ["/_next/static/chunks/lazy.js"],
      ["/_next/static/css/x.css"])
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
    const css = document.head.querySelector('link[rel="stylesheet"]')!;
    expect(css.getAttribute("href")).toBe("/_next/static/css/x.css");
    expect(css.getAttribute("data-precedence")).toBe("next");
    expect(css.compareDocumentPosition(document.head.querySelector("script")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
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

describe("loader waits for the hero's own LCP entry (Push AT1 attempt 3)", () => {
  type Entry = { element: Element | null; size: number };
  let report: (entries: Entry[]) => void = () => {};
  class FakeObserver {
    static supportedEntryTypes = ["largest-contentful-paint", "paint"];
    constructor(cb: (list: { getEntries: () => Entry[] }) => void) { report = (entries) => cb({ getEntries: () => entries }); }
    observe() {}
  }
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });
  const run = (complete = false) => {
    vi.useFakeTimers();
    vi.stubGlobal("PerformanceObserver", FakeObserver);
    document.body.innerHTML = `${HERO}<h1>Title</h1>`;
    const img = document.querySelector("img")!;
    Object.defineProperty(img, "complete", { value: complete });
    img.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 300, width: 400, height: 300, x: 0, y: 0, toJSON() {} });
    new Function(loaderScript(["/_next/static/chunks/a.js"], [], ["/_next/static/css/x.css"]).replace(/^<script>|<\/script>$/g, ""))();
    return img;
  };
  const started = () => document.head.querySelectorAll("script,link").length;

  it("holds the CSS and chunks after the hero load until the hero's LCP entry, then starts exactly once", () => {
    const img = run();
    report([{ element: document.querySelector("h1"), size: 5000 }]);
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(100);
    expect(started()).toBe(0);
    report([{ element: img, size: 120000 }]);
    vi.advanceTimersByTime(50);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="stylesheet"]')).toHaveLength(1);
    report([{ element: img, size: 120000 }]);
    window.dispatchEvent(new Event("pointerdown"));
    vi.advanceTimersByTime(DEFER_FALLBACK_MS);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
  });

  it("an LCP entry for the hero before its load event still waits for the load", () => {
    const img = run();
    report([{ element: img, size: 120000 }]);
    vi.advanceTimersByTime(100);
    expect(started()).toBe(0);
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(50);
    expect(started()).toBe(2);
  });

  it("starts after the hero load when a larger element is the LCP (the hero can never be it)", () => {
    const img = run();
    report([{ element: document.querySelector("h1"), size: 400 * 300 + 1 }]);
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(50);
    expect(started()).toBe(2);
  });

  it("a cached hero still waits for its LCP entry", () => {
    const img = run(true);
    vi.advanceTimersByTime(100);
    expect(started()).toBe(0);
    report([{ element: img, size: 120000 }]);
    vi.advanceTimersByTime(50);
    expect(started()).toBe(2);
  });

  it("a hero error starts the chunks without an LCP entry", () => {
    const img = run();
    img.dispatchEvent(new Event("error"));
    vi.advanceTimersByTime(50);
    expect(started()).toBe(2);
  });

  it("without an LCP entry (background tab) the input or the fallback still starts the chunks", () => {
    const img = run();
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(DEFER_FALLBACK_MS - 1);
    expect(started()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(started()).toBe(2);
  });

  it("without largest-contentful-paint support it starts after the hero load as before", () => {
    vi.useFakeTimers();
    vi.stubGlobal("PerformanceObserver", class { static supportedEntryTypes = ["paint"]; observe() {} });
    document.body.innerHTML = HERO;
    const img = document.querySelector("img")!;
    Object.defineProperty(img, "complete", { value: false });
    new Function(loaderScript(["/_next/static/chunks/a.js"], []).replace(/^<script>|<\/script>$/g, ""))();
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(50);
    expect(started()).toBe(1);
  });
});

describe("spot detail hero (Push AM2)", () => {
  const SPOT_IMG = '<img alt="Spot" fetchPriority="high" decoding="async" data-nimg="fill" class="object-cover" src="/media/spot/x.webp"/>';

  it("defers behind the next/image hero and leaves a spot without a photo unchanged", () => {
    const out: string = deferChunkScripts(page(SPOT_IMG), SPOT_HERO);
    expect(out).not.toMatch(/<script src="\/_next\/static\/chunks\/(a|b)\.js"/);
    expect(out).toContain('document.querySelector("img[fetchpriority=\\"high\\"]")');
    const noPhoto = page('<link rel="preload" as="image" fetchPriority="high" href="/x.webp"/><p>no photo</p>');
    expect(deferChunkScripts(noPhoto, SPOT_HERO)).toBe(noPhoto);
    expect(deferChunkScripts(page(SPOT_IMG))).toBe(page(SPOT_IMG));
  });

  it("the loader finds the spot hero in the browser and waits for it", () => {
    vi.useFakeTimers();
    document.body.innerHTML = SPOT_IMG;
    const img = document.querySelector("img")!;
    Object.defineProperty(img, "complete", { value: false });
    new Function(loaderScript(["/_next/static/chunks/a.js"], [], [], SPOT_HERO.selector).replace(/^<script>|<\/script>$/g, ""))();
    vi.advanceTimersByTime(100);
    expect(document.head.querySelectorAll("script")).toHaveLength(0);
    img.dispatchEvent(new Event("load"));
    vi.advanceTimersByTime(50);
    expect(document.head.querySelectorAll("script")).toHaveLength(1);
    vi.useRealTimers();
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });
});
