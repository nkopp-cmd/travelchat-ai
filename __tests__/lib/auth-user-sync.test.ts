import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  readOnly: false,
  users: new Map<string, Record<string, unknown>>(),
  subscriptions: new Map<string, Record<string, unknown>>(),
  calls: [] as { table: string; row: Record<string, unknown>; options?: Record<string, unknown> }[],
  failure: null as string | null,
}));
vi.mock("@/lib/supabase-read-only", () => ({ isSupabaseReadOnly: () => state.readOnly }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({
  from: (table: string) => ({
    upsert: async (row: Record<string, unknown>, options: Record<string, unknown>) => {
      state.calls.push({ table, row, options });
      if (options.onConflict !== (table === "users" ? "clerk_id" : "clerk_user_id")) return { error: { message: "wrong conflict target" } };
      if (state.failure) return { error: { message: state.failure } };
      const columns = table === "users"
        ? ["id", "clerk_id", "username", "email", "level", "xp", "title", "created_at"]
        : ["clerk_user_id", "tier", "status", "created_at", "updated_at"];
      if (Object.keys(row).some(key => !columns.includes(key))) return { error: { message: "unknown production column" } };
      if (table === "users" && !row.id) return { error: { message: "users.id has no default" } };
      const rows = table === "users" ? state.users : state.subscriptions;
      const key = String(row[table === "users" ? "clerk_id" : "clerk_user_id"]);
      if (!rows.has(key) || !options.ignoreDuplicates) rows.set(key, { ...row });
      return { error: null };
    },
    update: (row: Record<string, unknown>) => ({ eq: async (column: string, key: string) => {
      if (column !== "clerk_id") return { error: { message: "wrong owner column" } };
      state.calls.push({ table, row });
      if (Object.keys(row).some(column => column !== "email")) return { error: { message: "unsupported profile update" } };
      const existing = state.users.get(key);
      if (existing) Object.assign(existing, row);
      return { error: null };
    } }),
  }),
}) }));

import { syncAppUserCreated, syncAppUserUpdated } from "@/lib/auth/user-sync";
const user = { id: "auth-qa", email: "qa@example.test", name: "QA User", image: "https://example.test/avatar" };

beforeEach(() => {
  state.readOnly = false; state.users.clear(); state.subscriptions.clear(); state.calls.length = 0; state.failure = null;
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-only");
});

describe("auth hooks against the production application schema", () => {
  it("creates an app UUID and Free subscription using only existing columns", async () => {
    await syncAppUserCreated(user);
    expect(state.users.get(user.id)?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.users.get(user.id)?.email).toBe(user.email);
    expect(state.subscriptions.get(user.id)?.tier).toBe("free");
  });
  it("preserves the app ID, username, XP and paid subscription on repeated hooks", async () => {
    state.users.set(user.id, { id: "existing-app-id", username: "chosen", xp: 91 });
    state.subscriptions.set(user.id, { tier: "premium", stripe_subscription_id: "existing-paid" });
    await syncAppUserCreated(user); await syncAppUserCreated(user);
    expect(state.users.get(user.id)).toEqual({ id: "existing-app-id", username: "chosen", xp: 91 });
    expect(state.subscriptions.get(user.id)).toEqual({ tier: "premium", stripe_subscription_id: "existing-paid" });
  });
  it("repairs a missing app mapping on verification/update and preserves a paid tier", async () => {
    state.subscriptions.set(user.id, { tier: "pro" });
    await syncAppUserUpdated(user);
    expect(state.users.get(user.id)?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(state.users.get(user.id)?.email).toBe(user.email);
    expect(state.subscriptions.get(user.id)?.tier).toBe("pro");
  });
  it("updates email without changing an existing app profile or subscription", async () => {
    state.users.set(user.id, { id: "existing-app-id", username: "chosen", email: "old@example.test" });
    state.subscriptions.set(user.id, { tier: "pro" });
    await syncAppUserUpdated(user);
    expect(state.users.get(user.id)).toEqual({ id: "existing-app-id", username: "chosen", email: user.email });
    expect(state.subscriptions.get(user.id)?.tier).toBe("pro");
  });
  it("does not write on a read-only preview or without the service key", async () => {
    state.readOnly = true; await syncAppUserCreated(user); await syncAppUserUpdated(user);
    state.readOnly = false; vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    await syncAppUserCreated(user); await syncAppUserUpdated(user);
    expect(state.calls).toHaveLength(0);
  });
  it("reports a failed profile write without creating a subscription", async () => {
    state.failure = "database unavailable";
    await expect(syncAppUserCreated(user)).rejects.toThrow("users upsert failed");
    expect(state.calls).toHaveLength(1); expect(state.subscriptions.size).toBe(0);
  });
});
