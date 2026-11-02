// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(() => { throw new Error("supabase-js must not be built under D1"); }), currentUser: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/server", () => ({ currentUser: mocks.currentUser }));
vi.mock("@/lib/app-data/backend", async (original) => ({
  ...(await original<typeof import("@/lib/app-data/backend")>()), appDataDb: () => ({}) as never,
}));
import { appDataConfigured } from "@/lib/app-data/configured";
import { createSupabaseAdmin, createSupabaseClient } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-server";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("Supabase exit 8b: no Supabase client under DATA_BACKEND=d1", () => {
  it("builds every factory without Supabase env or supabase-js", async () => {
    vi.stubEnv("DATA_BACKEND", "d1");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    mocks.currentUser.mockResolvedValue({ id: "u1" });
    expect(appDataConfigured()).toBe(true);
    for (const client of [createSupabaseAdmin(), createSupabaseClient(), await createSupabaseServerClient()]) {
      expect(await client.from("notifications").select("*").eq("user_id", "u1")).toMatchObject({ data: null, error: { code: "PGRST205" } });
    }
    expect(() => createSupabaseAdmin().rpc("no_such_function")).toThrow(/not migrated/);
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("without D1 and without a service key, app data is not configured", () => {
    vi.stubEnv("DATA_BACKEND", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(appDataConfigured()).toBe(false);
  });
});
