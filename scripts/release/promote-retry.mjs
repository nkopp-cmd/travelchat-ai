// Bounded retry for `wrangler versions deploy` when Cloudflare cannot see a version it just created.
// Release a691c41 (2026-11-19): the upload returned version dcb26385 and the bindings read of /versions/<id> succeeded,
// then the promote 6 s later failed with "The requested Worker version could not be found" [code: 100146]
// (eventual consistency between the API and the deployments service). Production stayed on the previous version.
// Only that code is retried: any other promote failure (auth, bad config) stops the release at once.
export const PROMOTE_RETRIES = 3;
export const PROMOTE_RETRY_DELAY_MS = 10_000;

export function retryablePromote(result) {
  if (!result || result.status === 0) return false;
  return /\bcode: 100146\b/.test(`${result.stderr ?? ""}\n${result.stdout ?? ""}`);
}

export async function promoteWithRetry(runPromote, { retries = PROMOTE_RETRIES, delayMs = PROMOTE_RETRY_DELAY_MS, wait, log = console.log } = {}) {
  const pause = wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let result = runPromote();
  for (let attempt = 1; attempt <= retries && retryablePromote(result); attempt++) {
    log(`[release] Cloudflare does not see the new version yet (code 100146); promote retry ${attempt}/${retries} in ${Math.round(delayMs / 1000)} s`);
    await pause(delayMs);
    result = runPromote();
  }
  return result;
}
