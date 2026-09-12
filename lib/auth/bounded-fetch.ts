export const CLIENT_REQUEST_DEADLINE_MS = 20_000;
export const AUTH_RESPONSE_MAX_BYTES = 1024 * 1024;
// Detail rows include the full editable plan; allow twice the small endpoint budget.
export const EDITOR_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;

export class ClientRequestTimeoutError extends Error {
  constructor() { super("The request timed out. Retry to check the current state."); this.name = "ClientRequestTimeoutError"; }
}

/** Own deadlines never abort the caller's account/component lifetime. No retries. */
export async function withClientDeadline<T>(operation: (signal: AbortSignal) => Promise<T>, scope?: AbortSignal | null): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(scope?.reason);
  scope?.addEventListener("abort", abort, { once: true });
  if (scope?.aborted) abort();
  const timer = setTimeout(() => controller.abort(new ClientRequestTimeoutError()), CLIENT_REQUEST_DEADLINE_MS);
  let rejectAbort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    rejectAbort = () => reject(controller.signal.reason);
    controller.signal.addEventListener("abort", rejectAbort, { once: true });
    if (controller.signal.aborted) rejectAbort();
  });
  try {
    return await Promise.race([cancelled, (async () => {
      controller.signal.throwIfAborted();
      return operation(controller.signal);
    })()]);
  } finally {
    clearTimeout(timer);
    scope?.removeEventListener("abort", abort);
    controller.signal.removeEventListener("abort", rejectAbort);
  }
}

/** Fetch-compatible SDK adapter. Buffers source bytes before SDK parsing, including error bodies.
 * Same-origin HTTP(S) only; cookies stay browser-managed and redirects cannot carry scope headers.
 * Returns original status/headers; HEAD and null-body statuses remain bodyless.
 */
export async function boundedFetch(input: RequestInfo | URL, options: RequestInit = {}, maxBytes = AUTH_RESPONSE_MAX_BYTES): Promise<Response> {
  const origin = typeof window === "undefined" ? "https://localley.io" : window.location.origin;
  const url = new URL(input instanceof Request ? input.url : String(input), origin);
  if (!/^https?:$/.test(url.protocol) || url.origin !== origin || url.username || url.password) {
    throw new Error("Only same-origin HTTP requests are allowed.");
  }
  const scope = options.signal ?? (input instanceof Request ? input.signal : undefined);
  return withClientDeadline(async (signal) => {
    const response = await fetch(input, { ...options, credentials: "same-origin", redirect: "error", signal });
    const cancelBody = () => { void response.body?.cancel().catch(() => {}); };
    if (signal.aborted) { cancelBody(); signal.throwIfAborted(); }
    if (response.redirected || (response.url && new URL(response.url).origin !== origin)) {
      cancelBody();
      throw new Error("Redirected responses are not allowed.");
    }
    const method = options.method ?? (input instanceof Request ? input.method : "GET");
    if (method.toUpperCase() === "HEAD" || [204, 205, 304].includes(response.status) || !response.body) {
      cancelBody();
      return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
    }
    if (Number(response.headers.get("content-length")) > maxBytes) {
      cancelBody();
      throw new Error("Response is too large.");
    }
    const reader = response.body.getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener("abort", cancel, { once: true });
    let bytes = 0;
    const chunks: Uint8Array[] = [];
    try {
      for (;;) {
        signal.throwIfAborted();
        const { done, value } = await reader.read();
        signal.throwIfAborted();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > maxBytes) throw new Error("Response is too large.");
        chunks.push(value);
      }
      const body = new Uint8Array(bytes);
      let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
    } finally {
      signal.removeEventListener("abort", cancel);
      cancel();
      reader.releaseLock();
    }
  }, scope);
}
