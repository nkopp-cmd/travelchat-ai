import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), supabase: vi.fn(), link: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.supabase }));
vi.mock("@/lib/app-data/preview-conversations", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/app-data/preview-conversations")>(),
  linkPreviewConversation: mocks.link,
}));
import { PATCH } from "@/app/api/conversations/route";

const environment = process.env;
const preview = "localley-next-preview.nkopp.workers.dev";
const conversationId = "11111111-1111-4111-8111-111111111111";
const itineraryId = "22222222-2222-4222-8222-222222222222";
const request = (host: string, flag = true, link: unknown = itineraryId) => new NextRequest(
  `https://${host}/api/conversations${flag ? "?data_candidate=d1" : ""}`,
  { method: "PATCH", body: JSON.stringify({ conversationId, linked_itinerary_id: link }) },
);
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("conversation link candidate route", () => {
  it("requires auth and denies a link to an unowned conversation or itinerary", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValueOnce({ userId: null }).mockResolvedValue({ userId: "user-b" });
    expect((await PATCH(request(preview))).status).toBe(401);
    mocks.link.mockResolvedValue(false);
    expect((await PATCH(request(preview))).status).toBe(404);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("returns the existing success shape only on the exact preview candidate", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    mocks.link.mockResolvedValue(true);
    const response = await PATCH(request(preview));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.link).toHaveBeenCalledWith("user-a", conversationId, itineraryId);
    mocks.link.mockRejectedValueOnce(new RangeError("Invalid linked itinerary ID"));
    expect((await PATCH(request(preview, true, "bad-id"))).status).toBe(400);
  });

  it("keeps normal preview and www PATCH on Supabase", async () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    mocks.auth.mockResolvedValue({ userId: "user-a" });
    const update = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
      then: (resolve: (value: { error: null }) => void) => resolve({ error: null }) };
    mocks.supabase.mockResolvedValue({ from: vi.fn().mockReturnValue(update) });
    expect((await PATCH(request(preview, false))).status).toBe(200);
    expect((await PATCH(request("www.localley.io"))).status).toBe(200);
    expect(mocks.supabase).toHaveBeenCalledTimes(2);
    expect(mocks.link).not.toHaveBeenCalled();
  });
});
