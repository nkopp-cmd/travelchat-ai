import { cache } from "react";

// Per-request read timings for one server render (Push EM4). Workers' clock moves only across I/O, so each mark is
// the wait for one read; "total" minus the slowest chain shows the CPU share. A cached page never renders, so this
// logs once per cache miss only.
const requestTimings = cache(() => ({ start: Date.now(), marks: [] as string[] }));

// Isolate age and render number split a cold isolate (render 1, age ~0) from a busy warm one (EM4 attempt 4:
// all parallel reads ended together at 130-2000 ms, so per-read I/O is not the whole story).
// Set on the first render: Date.now() at module scope is not a real time in Workers.
let isolateStart: number | null = null;
let isolateRenders = 0;

export function timed<T>(label: string, read: Promise<T>): Promise<T> {
  const timings = requestTimings();
  const begin = Date.now();
  return read.finally(() => {
    timings.marks.push(`${label}=${Date.now() - begin}@${begin - timings.start}`);
  });
}

export function logRenderTimings(tag: string, key: string): void {
  const timings = requestTimings();
  isolateStart ??= timings.start;
  isolateRenders += 1;
  console.log(`[render-timing] ${tag} ${key} total=${Date.now() - timings.start} iso=${isolateRenders}@${timings.start - isolateStart} ${timings.marks.join(" ")}`);
}
