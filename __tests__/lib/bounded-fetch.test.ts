import { afterEach, expect, it, vi } from "vitest";
import { boundedFetch, ClientRequestTimeoutError, AUTH_RESPONSE_MAX_BYTES, EDITOR_RESPONSE_MAX_BYTES } from "@/lib/auth/bounded-fetch";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each(["headers", "body"])("bounds stalled %s without aborting the caller", async (phase) => {
  vi.useFakeTimers();
  const cancel = vi.fn().mockRejectedValue(new Error("cancel failed"));
  vi.stubGlobal("fetch", vi.fn(() => phase === "headers" ? new Promise(() => {}) : Promise.resolve(new Response(new ReadableStream({ cancel })))));
  const scope = new AbortController();
  const result = boundedFetch("/api/session", { signal: scope.signal });
  const assertion = expect(result).rejects.toBeInstanceOf(ClientRequestTimeoutError);
  await vi.advanceTimersByTimeAsync(20000); await assertion;
  expect(scope.signal.aborted).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  if (phase === "body") expect(cancel).toHaveBeenCalled();
});
it.each([AUTH_RESPONSE_MAX_BYTES, EDITOR_RESPONSE_MAX_BYTES])("caps streamed source bytes at %s", async (cap) => {
  const cancel = vi.fn().mockRejectedValue(new Error("cancel failed"));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(cap + 1)); }, cancel,
  }))));
  await expect(boundedFetch("/api/session", {}, cap)).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalled();
});
it.each(["https://other.invalid/api", "//other.invalid/api", "data:text/plain,x", "https://user:pass@localhost/api"])("rejects unsafe target %s before fetch", async (url) => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(boundedFetch(url, { headers: { "x-localley-session-id": "private" } })).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
it.each([204, 205, 304])("preserves null body status %s", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status, headers: { "x-test": "same" } })));
  const result = await boundedFetch("/api/session");
  expect(result.status).toBe(status); expect(result.body).toBeNull(); expect(result.headers.get("x-test")).toBe("same");
});
it("preserves HEAD and forces cookie and redirect safety", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null)); vi.stubGlobal("fetch", fetch);
  expect((await boundedFetch("/api/session", { method: "HEAD", credentials: "include", redirect: "follow" })).body).toBeNull();
  expect(fetch).toHaveBeenCalledWith("/api/session", expect.objectContaining({ credentials: "same-origin", redirect: "error" }));
});
it("cancels a late header response even when cancellation rejects", async () => {
  vi.useFakeTimers();
  let finish!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; })));
  const result = expect(boundedFetch("/api/session")).rejects.toBeInstanceOf(ClientRequestTimeoutError);
  await vi.advanceTimersByTimeAsync(20000); await result;
  const cancel = vi.fn().mockRejectedValue(new Error("late cancellation failed"));
  finish(new Response(new ReadableStream({ cancel })));
  await vi.advanceTimersByTimeAsync(1);
  expect(cancel).toHaveBeenCalled();
});
it("rejects oversized declared bodies and preserves bounded error responses", async () => {
  const cancel = vi.fn().mockRejectedValue(new Error("cancel failed"));
  const fetch = vi.fn().mockResolvedValueOnce(new Response(new ReadableStream({ cancel }), {
    headers: { "content-length": String(AUTH_RESPONSE_MAX_BYTES + 1) },
  })).mockResolvedValueOnce(Response.json({ error: "denied" }, { status: 403, headers: { "x-test": "same" } }));
  vi.stubGlobal("fetch", fetch);
  await expect(boundedFetch("/api/session")).rejects.toThrow("too large");
  expect(cancel).toHaveBeenCalled();
  const result = await boundedFetch("/api/session");
  expect(result.status).toBe(403); expect(result.headers.get("x-test")).toBe("same");
  expect(await result.json()).toEqual({ error: "denied" });
});
