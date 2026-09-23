import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readOnlyFetch, SUPABASE_READ_ONLY_ERROR, withReadOnlyGuard } from "@/lib/supabase-read-only";

describe("supabase read-only guard", () => {
  const original = process.env.SUPABASE_READ_ONLY;
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset().mockResolvedValue(new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (original === undefined) delete process.env.SUPABASE_READ_ONLY;
    else process.env.SUPABASE_READ_ONLY = original;
  });

  it("leaves client options unchanged when the flag is off", () => {
    delete process.env.SUPABASE_READ_ONLY;
    const options = { global: { headers: { Authorization: "Bearer t" } } };
    expect(withReadOnlyGuard(options)).toBe(options);
  });

  it("injects the read-only fetch and keeps headers when the flag is on", () => {
    process.env.SUPABASE_READ_ONLY = "true";
    const guarded = withReadOnlyGuard({ global: { headers: { Authorization: "Bearer t" } } });
    expect(guarded.global?.fetch).toBe(readOnlyFetch);
    expect(guarded.global?.headers).toEqual({ Authorization: "Bearer t" });
  });

  it("passes GET and HEAD through", async () => {
    await readOnlyFetch("https://x.supabase.co/rest/v1/spots?select=*");
    await readOnlyFetch("https://x.supabase.co/rest/v1/spots", { method: "HEAD" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["POST", "PATCH", "PUT", "DELETE"])("refuses %s without a network call", async (method) => {
    const response = await readOnlyFetch("https://x.supabase.co/rest/v1/spots", { method });
    expect(response.status).toBe(403);
    expect((await response.json()).message).toBe(SUPABASE_READ_ONLY_ERROR);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a POST Request object (RPC and storage uploads)", async () => {
    const response = await readOnlyFetch(new Request("https://x.supabase.co/rest/v1/rpc/f", { method: "POST" }));
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
