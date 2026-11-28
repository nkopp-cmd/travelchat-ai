import { cache } from "react";

// Per-request read timings for one server render (Push EM4). Workers' clock moves only across I/O, so each mark is
// the wait for one read; "total" minus the slowest chain shows the CPU share. A cached page never renders, so this
// logs once per cache miss only.
const requestTimings = cache(() => ({ start: Date.now(), marks: [] as string[] }));

export function timed<T>(label: string, read: Promise<T>): Promise<T> {
  const timings = requestTimings();
  const begin = Date.now();
  return read.finally(() => {
    timings.marks.push(`${label}=${Date.now() - begin}@${begin - timings.start}`);
  });
}

export function logRenderTimings(tag: string, key: string): void {
  const timings = requestTimings();
  console.log(`[render-timing] ${tag} ${key} total=${Date.now() - timings.start} ${timings.marks.join(" ")}`);
}
