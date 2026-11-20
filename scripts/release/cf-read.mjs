// Bounded retry for Cloudflare API reads in the release lane.
// Release 8440855 (2026-11-18) uploaded version cdc0aa37 and then failed on GET /versions/cdc0aa37: the API had not
// yet caught up with the new version (the same read succeeded minutes later). A read changes nothing, so retrying it
// is safe; the loop stops after `retries` extra attempts.
// Release 1ae921b (2026-11-20): upload printed version acd0a190 at ~12:37:45Z, Cloudflare dated it 12:38:12Z and
// GET /versions/<id> still answered 404 on some reads after 12:40Z. 4 x 5 s (20 s) was too short; the pause now grows
// 5, 10, 20, 30, 30 ... s, so 10 retries wait about 4 minutes in total.
export const READ_RETRIES = 10;
export const READ_RETRY_DELAY_MS = 5_000;
export const READ_RETRY_MAX_DELAY_MS = 30_000;

/** Pause before retry `attempt` (1-based): doubles from `delayMs`, never above `maxDelayMs`. */
export function retryDelay(attempt, delayMs = READ_RETRY_DELAY_MS, maxDelayMs = READ_RETRY_MAX_DELAY_MS) {
  return Math.min(delayMs * 2 ** (attempt - 1), maxDelayMs);
}

export async function readWithRetry(readOnce, { retries = READ_RETRIES, delayMs = READ_RETRY_DELAY_MS, maxDelayMs = READ_RETRY_MAX_DELAY_MS, wait, log = console.log, label = "" } = {}) {
  const pause = wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      const ms = retryDelay(attempt, delayMs, maxDelayMs);
      log(`[release] Cloudflare read ${label} not ready; retry ${attempt}/${retries} in ${Math.round(ms / 1000)} s`);
      await pause(ms);
    }
    try {
      const body = await readOnce();
      if (body?.success) return body.result;
      lastError = new Error(`Cloudflare read failed: ${label}`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}
