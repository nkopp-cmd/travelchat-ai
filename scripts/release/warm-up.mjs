// Post-promote warm-up. A new Worker version starts cold on every edge machine: the first requests load and compile
// the ~6 MB (gzip) OpenNext bundle and take 1-1.6 s (b0c5c51: lane perf-check /api/version warm median 1286 ms,
// 43-68 ms ten minutes later). Before the lane's smoke and perf check, request the uncached Worker routes until a
// run of fast rounds shows warm isolates, so the first visitors do not pay the cold start.
// Rounds are parallel bursts (Push DG fix, d44671c: one request at a time over one kept-alive connection warmed too
// few isolates; the lane's perf-check then met cold ones, warm median 640 ms). A burst opens several connections, so
// the colo spreads it over more machines. A round is fast only when every answer in it is fast.
// Warning only: it never fails a release. Bounded: at most MAX_REQUESTS requests and DEADLINE_MS in total.
export const FAST_MS = 200;
export const BURST = 8;
export const NEEDED_FAST_ROUNDS = 4;
export const MAX_REQUESTS = 160;
export const DEADLINE_MS = 90_000;

/**
 * @param {string[]} urls uncached Worker URLs, spread over each burst
 * @param {{ timed?: (url: string) => Promise<number>, now?: () => number, wait?: (ms: number) => Promise<void> }} [io]
 * @returns {Promise<{ warm: boolean, requests: number, rounds: number, fastRounds: number, slowest: number }>}
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
  let requests = 0, rounds = 0, fastRounds = 0, slowest = 0;
  while (requests + BURST <= MAX_REQUESTS && now() - start < DEADLINE_MS) {
    const burst = Array.from({ length: BURST }, (_, i) => urls[(requests + i) % urls.length]);
    requests += BURST;
    rounds++;
    const times = await Promise.all(burst.map((url) => timed(url).catch(() => Infinity)));
    const worst = Math.max(...times);
    slowest = Math.max(slowest, Number.isFinite(worst) ? worst : 10_000);
    fastRounds = worst <= FAST_MS ? fastRounds + 1 : 0;
    if (fastRounds >= NEEDED_FAST_ROUNDS) return { warm: true, requests, rounds, fastRounds, slowest: Math.round(slowest) };
    if (worst > FAST_MS) await wait(500);
  }
  return { warm: false, requests, rounds, fastRounds, slowest: Math.round(slowest) };
}
