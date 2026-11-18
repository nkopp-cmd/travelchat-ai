// Bounded retry for Cloudflare API reads in the release lane.
// Release 8440855 (2026-11-18) uploaded version cdc0aa37 and then failed on GET /versions/cdc0aa37: the API had not
// yet caught up with the new version (the same read succeeded minutes later). A read changes nothing, so retrying it
// is safe; the loop stops after `retries` extra attempts.
export const READ_RETRIES = 4;
export const READ_RETRY_DELAY_MS = 5_000;

export async function readWithRetry(readOnce, { retries = READ_RETRIES, delayMs = READ_RETRY_DELAY_MS, wait, log = console.log, label = "" } = {}) {
  const pause = wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      log(`[release] Cloudflare read ${label} not ready; retry ${attempt}/${retries} in ${Math.round(delayMs / 1000)} s`);
      await pause(delayMs);
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
