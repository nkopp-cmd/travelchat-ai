import { afterEach, beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
const identity = (id: string) => ({ user: { id, name: `Synthetic ${id}`, email: `${id}@example.test`, emailVerified: true },
  session: { id: `session-${id}`, userId: id } });
const mapping = (id: string) => ({ state: "unlinked", authUserId: id, sessionId: `session-${id}` });

it("the native auth consumer sends the observed session precondition on mapping reads", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(identity("a"))).mockResolvedValueOnce(Response.json(mapping("a")));
  vi.stubGlobal("fetch", fetch);
  const consumer = await import("../../cloudflare/auth-proof/web/session");
  await consumer.refreshContext();
  expect(consumer.getSnapshot()).toMatchObject({ phase: "unlinked", session: mapping("a") });
  expect(new Headers(fetch.mock.calls[1][1].headers).get("x-localley-session-id")).toBe("session-a");
  expect(fetch.mock.calls.every(([, options]) => options.redirect === "error" && options.credentials === "same-origin")).toBe(true);
});

it.each(["auth-headers", "mapping-body"])("native %s timeout exits loading without retries or false identity", async phase => {
  vi.useFakeTimers();
  const fetch = phase === "auth-headers" ? vi.fn(() => new Promise<Response>(() => {}))
    : vi.fn().mockResolvedValueOnce(Response.json(identity("a"))).mockResolvedValueOnce(new Response(new ReadableStream()));
  vi.stubGlobal("fetch", fetch);
  const consumer = await import("../../cloudflare/auth-proof/web/session");
  const pending = consumer.refreshContext();
  await vi.advanceTimersByTimeAsync(20001); await pending;
  expect(consumer.getSnapshot()).toMatchObject({ phase: "error" });
  expect(consumer.getSnapshot().session).toBeUndefined();
  expect(consumer.getSnapshot().user).toBeUndefined();
  expect(fetch).toHaveBeenCalledTimes(phase === "auth-headers" ? 1 : 2);
});

it("replacing a native account aborts old mapping reads and suppresses delayed data", async () => {
  let resolveOld!: (response: Response) => void;
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(identity("a")))
    .mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
    .mockResolvedValueOnce(Response.json(identity("b"))).mockResolvedValueOnce(Response.json(mapping("b")));
  vi.stubGlobal("fetch", fetch);
  const consumer = await import("../../cloudflare/auth-proof/web/session");
  const old = consumer.refreshContext();
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  await consumer.refreshContext();
  resolveOld(Response.json(mapping("a"))); await old;
  expect(consumer.getSnapshot()).toMatchObject({ phase: "unlinked", session: mapping("b"), user: { email: "b@example.test" } });
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
});

it("a timed-out sign-out keeps private context blocked instead of claiming logout", async () => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
  const consumer = await import("../../cloudflare/auth-proof/web/session");
  const pending = consumer.logout();
  await vi.advanceTimersByTimeAsync(20001); await pending;
  expect(consumer.getSnapshot()).toMatchObject({ phase: "blocked" });
  expect(consumer.getSnapshot().session).toBeUndefined();
  expect(consumer.getSnapshot().error).toContain("Sign-out failed");
});
