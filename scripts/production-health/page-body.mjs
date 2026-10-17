// The caller's fetch deadline must cover headers AND this complete drain.
// Count/discard bytes; never retain or report HTML or raw upstream errors.
export async function checkPageBody(response) {
  if (!response.body) return { usable: false, reason: 'page_body_missing', bytes: 0 };
  const reader = response.body.getReader();
  const limit = 2 * 1024 * 1024;
  let bytes = 0, complete = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) { complete = true; break; }
      bytes += value.byteLength;
      if (bytes > limit) return { usable: false, reason: 'page_body_too_large', bytes: limit + 1 };
    }
    return { usable: bytes > 0, reason: bytes ? 'page_body_complete' : 'page_body_empty', bytes };
  } catch {
    return { usable: false, reason: 'page_body_failed_or_timed_out', bytes: Math.min(bytes, limit + 1) };
  } finally {
    if (!complete) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
