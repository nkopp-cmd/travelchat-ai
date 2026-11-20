// Bounded retry for `wrangler versions deploy` when Cloudflare cannot see a version it just created.
// Release a691c41 (2026-11-19): the upload returned version dcb26385 and the bindings read of /versions/<id> succeeded,
// then the promote 6 s later failed with "The requested Worker version could not be found" [code: 100146]
// (eventual consistency between the API and the deployments service). Production stayed on the previous version.
// Only that code is retried: any other promote failure (auth, bad config) stops the release at once.
// Release 1ae921b (2026-11-20): a hand promote 2 minutes after the upload still got 100146 twice, so 3 x 10 s was
// too short. 6 x 20 s = 2 minutes.
export const PROMOTE_RETRIES = 6;
export const PROMOTE_RETRY_DELAY_MS = 20_000;

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
