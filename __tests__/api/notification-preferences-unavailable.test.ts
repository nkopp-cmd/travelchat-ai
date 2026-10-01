import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), single: vi.fn(), from: vi.fn(), eq: vi.fn(), insert: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ from: mocks.from }) }));
import { GET, PATCH } from "@/app/api/notifications/preferences/route";
const missing = { code: "PGRST205", message: "private schema detail" };
const owner = "qa-owner";
const row = { clerk_user_id: owner, push_enabled: false, email_enabled: false, achievements: true, level_ups: true,
 new_spots: true, social: false, challenges: false, weekly_digest: false, system: true, timezone: "UTC" };
beforeEach(() => {
 vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: owner });
 const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq, single: mocks.single, insert: mocks.insert, update: mocks.update };
 mocks.eq.mockReturnValue(query); mocks.insert.mockReturnValue(query); mocks.update.mockReturnValue(query); mocks.from.mockReturnValue(query);
 mocks.single.mockResolvedValue({ data: null, error: missing });
});
const patch = () => PATCH(new NextRequest("https://www.localley.io/api/notifications/preferences", { method: "PATCH", body: JSON.stringify({ emailEnabled: false }) }));
describe("notification settings storage availability", () => {
 it("shows unavailable without invented preferences when the table is absent", async () => {
 const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
 expect(await response.json()).toEqual({ available: false, preferences: null, message: "Notification settings are unavailable." });
 expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.eq).toHaveBeenCalledWith("clerk_user_id", owner);
 });
 it("refuses a save instead of confirming persistence in absent storage", async () => {
 const response = await patch(); expect(response.status).toBe(503); expect((await response.json()).error).toBe("notifications_unavailable");
 expect(mocks.eq).toHaveBeenCalledWith("clerk_user_id", owner);
 });
 it("refuses absent storage discovered when creating first preferences", async () => {
 mocks.single.mockResolvedValueOnce({ data: null, error: { code: "PGRST116" } });
 expect((await GET()).status).toBe(200); expect(mocks.insert).toHaveBeenCalledWith({ clerk_user_id: owner });
 });
 it("keeps actual preferences and owner scope when storage exists", async () => {
 mocks.single.mockResolvedValue({ data: row, error: null }); const response = await GET();
 expect(response.status).toBe(200); expect((await response.json()).emailEnabled).toBe(false); expect(mocks.insert).not.toHaveBeenCalled();
 });
 it("keeps real database failures as failures", async () => {
 mocks.single.mockResolvedValue({ data: null, error: { code: "XX000", message: "private data" } });
 const response = await GET(); expect(response.status).toBe(500); expect(await response.text()).not.toContain("private data");
 });
 it("requires a signed-in owner for both reads and writes", async () => {
 mocks.auth.mockResolvedValue({ userId: null }); expect((await GET()).status).toBe(401); expect((await patch()).status).toBe(401); expect(mocks.from).not.toHaveBeenCalled();
 });
});
