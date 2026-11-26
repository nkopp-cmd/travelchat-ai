import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue";

// Next.js data cache (unstable_cache) lives in R2; revalidateTag("spots") and
// per-user tags are tracked in D1. Revalidation runs in-process through the
// WORKER_SELF_REFERENCE binding, which is enough for Localley's traffic.
// Push DQ3: a per-colo Cache API copy sits in front of R2, so a warm data-cache read
// skips the R2 round trip. The D1 tag cache is still checked on every hit
// (bypassTagCacheOnCacheHit stays false), so revalidateTag("spots") keeps working.
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  tagCache: d1NextTagCache,
  queue: memoryQueue,
});
