import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ upsert: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ from: () => ({ upsert: mocks.upsert }) }) }));
import { savePushSubscription } from "@/lib/notifications";
beforeEach(() => { mocks.upsert.mockReset().mockResolvedValue({ error: null }); });
describe("push subscription owner conflict key", () => {
 it("keeps a shared endpoint owned separately by each account", async () => {
 const subscription = { endpoint: "https://push.example/owned", p256dh: "key", auth: "secret" };
 await savePushSubscription("owner-a", subscription); await savePushSubscription("owner-b", subscription);
 expect(mocks.upsert.mock.calls.map(c => c[0].clerk_user_id)).toEqual(["owner-a", "owner-b"]);
 for (const call of mocks.upsert.mock.calls) expect(call[1]).toEqual({ onConflict: "clerk_user_id,endpoint" });
 });
});
