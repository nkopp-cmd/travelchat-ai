// Post-promote warm-up. A new Worker version starts cold on every edge machine: the first requests load and compile
// the ~6 MB (gzip) OpenNext bundle and take 1-1.6 s (b0c5c51: lane perf-check /api/version warm median 1286 ms,
// 43-68 ms ten minutes later). Before the lane's smoke and perf check, request the uncached Worker routes until a
// run of consecutive fast answers shows warm isolates, so the first visitors do not pay the cold start.
// Warning only: it never fails a release. Bounded: at most MAX_REQUESTS requests and DEADLINE_MS in total.
export const FAST_MS = 200;
export const NEEDED_FAST = 5;
export const MAX_REQUESTS = 60;
export const DEADLINE_MS = 90_000;

/**
 * @param {string[]} urls uncached Worker URLs, requested in turn
 * @param {{ timed?: (url: string) => Promise<number>, now?: () => number, wait?: (ms: number) => Promise<void> }} [io]
 * @returns {Promise<{ warm: boolean, requests: number, fast: number, slowest: number }>}
 */
export async function warmUp(urls, io = {}) {
  const now = io.now ?? Date.now;
  const wait = io.wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timed = io.timed ?? (async (url) => {
    const start = now();
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
    await response.arrayBuffer();
    if (!response.ok) throw new Error(`HTTP ${response.status}`); // a 403/5xx from the edge warms nothing
    return now() - start;
  });
  const start = now();
  let requests = 0, fast = 0, slowest = 0;
  while (requests < MAX_REQUESTS && now() - start < DEADLINE_MS) {
    const url = urls[requests % urls.length];
    requests++;
    const ms = await timed(url).catch(() => Infinity);
    slowest = Math.max(slowest, Number.isFinite(ms) ? ms : 10_000);
    fast = ms <= FAST_MS ? fast + 1 : 0;
    if (fast >= NEEDED_FAST * urls.length) return { warm: true, requests, fast, slowest: Math.round(slowest) };
    if (ms > FAST_MS) await wait(500);
  }
  return { warm: false, requests, fast, slowest: Math.round(slowest) };
}
