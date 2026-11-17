// One retry for an OpenNext upload that died before it reached Cloudflare.
// Release 7a63445 (2026-11-17) failed with Miniflare ERR_RUNTIME_FAILURE: the local workerd runtime (used to read
// the bindings) could not start while the host /tmp quota was full. That is a host fault, not a code fault, and the
// lane gives each commit one attempt, so one bounded retry saves a release. Never retry after a version was created.
export const UPLOAD_RETRIES = 1;
export const UPLOAD_RETRY_DELAY_MS = 20_000;

export function retryableUpload(result) {
  if (!result || result.status === 0) return false;
  if (/Worker Version ID:/.test(result.stdout ?? "")) return false;
  const text = `${result.stderr ?? ""}\n${result.stdout ?? ""}`;
  return /ERR_RUNTIME_FAILURE|EDQUOT|ENOSPC/.test(text);
}

export async function uploadWithRetry(runUpload, { retries = UPLOAD_RETRIES, delayMs = UPLOAD_RETRY_DELAY_MS, wait, log = console.log } = {}) {
  const pause = wait ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let result = runUpload();
  for (let attempt = 1; attempt <= retries && retryableUpload(result); attempt++) {
    log(`[release] upload hit a local runtime fault; retry ${attempt}/${retries} in ${Math.round(delayMs / 1000)} s`);
    await pause(delayMs);
    result = runUpload();
  }
  return result;
}
