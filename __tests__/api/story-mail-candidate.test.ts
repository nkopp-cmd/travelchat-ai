import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), queue: vi.fn(), send: vi.fn(), user: vi.fn(), source: vi.fn(), limit: vi.fn(), mode: vi.fn(), eq: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: mocks.user }));
vi.mock("@/lib/app-data/preview-story-mail", () => ({ queuePreviewStoryMail: mocks.queue }));
vi.mock("@/lib/story-mail", () => ({ sendStoryReadyEmail: mocks.send }));
vi.mock("@/lib/auth/mail", () => ({ authMailMode: mocks.mode }));
vi.mock("@/lib/itinerary-mail-limit", () => ({ reserveItineraryMail: mocks.limit }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.source }));
import { POST } from "@/app/api/itineraries/[id]/notify-story-ready/route";
const environment = process.env;
const host = "localley-next-preview.nkopp.workers.dev";
const context = { params: Promise.resolve({ id: "owned-id" }) };
const req = (body: string = "{}", hostname = host, flag = true) => new NextRequest(
  `https://${hostname}/api/itineraries/owned-id/notify-story-ready${flag ? "?data_candidate=d1" : ""}`,
  { method: "POST", body });
beforeEach(() => { process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.auth.mockResolvedValue({ userId: "a" }); mocks.queue.mockResolvedValue(true);
  mocks.mode.mockReturnValue("cloudflare"); mocks.limit.mockResolvedValue("allowed");
  mocks.user.mockResolvedValue({ id: "a", emailVerified: true, primaryEmailAddress: { emailAddress: "a@example.com" } }); });
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("story mail route", () => {
  it("records an outbox request honestly with private candidate headers and no Resend", async () => {
    const response = await POST(req('{"city":"Seoul"}'), context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, sent: false, queued: true, reason: "preview_outbox" });
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(mocks.queue).toHaveBeenCalledWith("a", "owned-id");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("refuses anonymous, foreign and unavailable cases without falling back", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    expect((await POST(req(), context)).status).toBe(401);
    expect(mocks.queue).not.toHaveBeenCalled();
    mocks.auth.mockResolvedValue({ userId: "a" }); mocks.queue.mockResolvedValue(false);
    expect((await POST(req(), context)).status).toBe(404);
    mocks.queue.mockRejectedValue(new Error("private@example.com"));
    const response = await POST(req(), context);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private@example.com");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects malformed, excessive, recipient, link and content overrides before queueing", async () => {
    for (const body of ["broken", "null", "[]", '{"to":"other@example.com"}', '{"url":"https://evil.test"}',
      '{"city":3}', JSON.stringify({ city: "x".repeat(101) }), JSON.stringify({ city: "a\nb" }), " ".repeat(513)]) {
      expect((await POST(req(body), context)).status).toBe(400);
    }
    expect(mocks.queue).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("uses Cloudflare with verified source ownership on www and normal preview", async () => {
    const id = "12345678-1234-1234-1234-123456789abc";
    const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { id, clerk_user_id: "a", story_slides: { cover: "https://storage.test/cover.png" } }, error: null }) };
    mocks.source.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
    mocks.send.mockResolvedValue({ sent: true, emailId: "cf-id" });
    for (const hostname of [host, "www.localley.io"]) {
      const request = new NextRequest(`https://${hostname}/api/itineraries/${id}/notify-story-ready`, { method: "POST", body: '{"city":"Seoul"}' });
      const response = await POST(request, { params: Promise.resolve({ id }) });
      expect(await response.json()).toEqual({ success: true, sent: true, emailId: "cf-id" });
      expect(response.headers.get("X-Localley-Data-Source")).toBeNull();
      expect(response.headers.get("Cache-Control")).toContain("private");
    }
    expect(mocks.eq).toHaveBeenCalledWith("clerk_user_id", "a");
    expect(mocks.send).toHaveBeenCalledWith("a@example.com", `https://localley.io/itineraries/${id}/stories`);
    expect(mocks.queue).not.toHaveBeenCalled();
  });
});
