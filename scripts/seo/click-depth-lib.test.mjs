import { test } from "node:test";
import assert from "node:assert/strict";
import { allWithinBudget, bfsDepth, depthReport, internalLinks, pacer, pageType } from "./click-depth-lib.mjs";

const A = "f242e187-56ee-4cc8-9736-52f4ea46aebc";

test("internalLinks keeps same-site page paths, drops api, assets and other hosts", () => {
  const html = `<a href="/spots/a-z/seoul">x</a><a class="c" href="https://www.localley.io/spots/${A}#top">y</a>
    <a href="/spots?city=tokyo&amp;page=2">z</a><a href="https://example.com/x">e</a><a href="/api/x">a</a><a href="/og.png">i</a><a href="/blog/">b</a>`;
  assert.deepEqual([...internalLinks(html)].sort(), ["/blog", "/spots/a-z/seoul", `/spots/${A}`, "/spots?city=tokyo&page=2"]);
});

test("pageType classifies city lists and spot pages", () => {
  assert.equal(pageType(`/spots/${A}`), "spot");
  assert.equal(pageType("/spots/a-z/ho-chi-minh"), "city");
  assert.equal(pageType("/spots?city=seoul"), "city");
  assert.equal(pageType("/spots?city=seoul&page=2"), "other");
  assert.equal(pageType("/blog"), "other");
});

test("bfsDepth returns the shortest click depth and stops at maxDepth", () => {
  const g = { "/": ["/a", "/b"], "/a": ["/c", "/b"], "/b": ["/d"], "/c": ["/e"], "/d": ["/c"], "/e": ["/f"] };
  const d = bfsDepth("/", (p) => g[p], 3);
  assert.deepEqual(Object.fromEntries(d), { "/": 0, "/a": 1, "/b": 1, "/c": 2, "/d": 2, "/e": 3 });
});

test("bfsDepth depth never exceeds maxDepth and every node is reachable (random graphs)", () => {
  for (let seed = 1; seed <= 200; seed++) {
    let s = seed;
    const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const n = 2 + Math.floor(rnd() * 30);
    const g = {};
    for (let i = 0; i < n; i++) g[`/${i}`] = Array.from({ length: Math.floor(rnd() * 4) }, () => `/${Math.floor(rnd() * n)}`);
    const max = 1 + Math.floor(rnd() * 4);
    const d = bfsDepth("/0", (p) => g[p], max);
    for (const [p, k] of d) {
      assert.ok(k <= max);
      if (p !== "/0") assert.ok(Object.entries(g).some(([q, out]) => d.get(q) === k - 1 && out.includes(p)), `parent of ${p}`);
    }
  }
});

test("depthReport applies city <= 2 and spot <= 3", () => {
  const depth = new Map([["/spots/a-z/seoul", 1], ["/spots/a-z/tokyo", 3], [`/spots/${A}`, 3]]);
  const r = depthReport(["/spots/a-z/seoul", "/spots/a-z/tokyo", "/spots/a-z/osaka", `/spots/${A}`, "/blog"], depth);
  assert.deepEqual(r, { city: { total: 3, within: 1, over: ["/spots/a-z/tokyo", "/spots/a-z/osaka"] }, spot: { total: 1, within: 1, over: [] } });
});

test("pacer spaces request starts at least 1000/rps ms apart, also for parallel callers (Push DM2)", async () => {
  let clock = 1000;
  const starts = [];
  const wait = pacer(2, () => clock, async (ms) => { clock += ms; });
  for (let i = 0; i < 5; i++) { await wait(); starts.push(clock); }
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] - starts[i - 1] >= 500, `gap ${starts[i] - starts[i - 1]}`);
  // Parallel callers on a real clock: 4 starts at 20 req/s take >= 3 gaps.
  const real = pacer(20);
  const t0 = Date.now();
  await Promise.all([real(), real(), real(), real()]);
  assert.ok(Date.now() - t0 >= 140);
});

test("allWithinBudget stops the crawl once every target is within its budget", () => {
  const depth = new Map([["/", 0], ["/spots/a-z/seoul", 1], [`/spots/${A}`, 2]]);
  assert.equal(allWithinBudget(["/spots/a-z/seoul", `/spots/${A}`], depth), true);
  assert.equal(allWithinBudget(["/spots/a-z/seoul", `/spots/${A}`, "/spots/a-z/tokyo"], depth), false);
  assert.equal(allWithinBudget([], depth), true);
});
