import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const m = vi.hoisted(() => ({ auth: vi.fn(), user: vi.fn(), source: vi.fn(), send: vi.fn(), mode: vi.fn(), limit: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: m.auth, currentUser: m.user }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: m.source }));
vi.mock("@/lib/story-mail", () => ({ sendStoryReadyEmail: m.send }));
vi.mock("@/lib/auth/mail", () => ({ authMailMode: m.mode }));
vi.mock("@/lib/itinerary-mail-limit", () => ({ reserveItineraryMail: m.limit }));
vi.mock("@/lib/app-data/preview-story-mail", () => ({ queuePreviewStoryMail: vi.fn() }));
import { POST } from "@/app/api/itineraries/[id]/notify-story-ready/route";
const id = "12345678-1234-1234-1234-123456789abc";
const env = process.env;
let row: Record<string, unknown> | null, error: { code: string } | null;
function request(body="{}") { return new NextRequest(`https://www.localley.io/api/itineraries/${id}/notify-story-ready`, { method: "POST", body }); }
const run = (body="{}") => POST(request(body), { params: Promise.resolve({ id }) });
beforeEach(() => {
 process.env = { ...env, AUTH_MAIL_MODE: "cloudflare", SUPABASE_READ_ONLY: "false" };
 m.auth.mockResolvedValue({ userId: "owner" });
 m.user.mockResolvedValue({ id: "owner", emailVerified: true, primaryEmailAddress: { emailAddress: "owner@example.com" } });
 m.mode.mockReturnValue("cloudflare"); m.limit.mockResolvedValue("allowed"); m.send.mockResolvedValue({ sent: true, emailId: "cf" });
 row = { id, clerk_user_id: "owner", story_slides: { cover: "https://storage.test/cover.png" } }; error = null;
 const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data: row, error })) };
 m.source.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => { process.env = env; vi.clearAllMocks(); });
describe("owned Cloudflare story mail", () => {
 it("denies anonymous and unverified or mismatched recipients before source and transport", async () => {
  m.auth.mockResolvedValue({ userId: null }); expect((await run()).status).toBe(401);
  m.auth.mockResolvedValue({ userId: "owner" });
  for (const user of [{ id: "owner", emailVerified: false }, { id: "foreign", emailVerified: true }]) {
   m.user.mockResolvedValue(user); expect((await run()).status).toBe(403);
  }
  expect(m.source).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
 });
 it("refuses missing or foreign rows without reservation or mail", async () => {
  row = null; error = { code: "PGRST116" }; expect((await run()).status).toBe(404);
  error = null; row = { id, clerk_user_id: "foreign" }; expect((await run()).status).toBe(404);
  expect(m.limit).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
 });
 it("refuses bad source reads and does not claim delivery", async () => {
  error = { code: "57014" }; const response = await run(); expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ success: true, sent: false, reason: "send_failed" });
  expect(m.send).not.toHaveBeenCalled();
 });
 it("rejects oversized and injected recipient or link bodies before source reads", async () => {
  for (const body of ['broken', 'null', '[]', '{"to":"other@example.com"}', '{"url":"https://evil.test"}', ' '.repeat(513)]) expect((await run(body)).status).toBe(400);
  expect(m.source).not.toHaveBeenCalled(); expect(m.send).not.toHaveBeenCalled();
 });
 it("requires persisted slides, supporting both existing storage shapes", async () => {
  row!.story_slides = null; expect(await (await run()).json()).toMatchObject({ sent: false, reason: "stories_not_ready" });
  expect(m.limit).not.toHaveBeenCalled();
  row!.story_slides = { slides: { day1: "https://storage.test/day.png" } };
  expect(await (await run()).json()).toMatchObject({ sent: true });
 });
 it("honors shared atomic limit and missing schema before dispatch", async () => {
  m.limit.mockResolvedValue("limited"); expect((await run()).status).toBe(429);
  m.limit.mockResolvedValue("unavailable"); expect((await run()).status).toBe(503);
  expect(m.send).not.toHaveBeenCalled();
 });
 it("queues normal preview without spending a live send reservation", async () => {
  m.mode.mockReturnValue("outbox"); m.send.mockResolvedValue({ sent: false, queued: true, reason: "preview_outbox" });
  expect(await (await run()).json()).toEqual({ success: true, sent: false, queued: true, reason: "preview_outbox" });
  expect(m.limit).not.toHaveBeenCalled();
 });
 it("consumes a reservation for suppressed or unknown sends and never retries", async () => {
  m.send.mockRejectedValue(new Error("secret recipient provider detail")); const response = await run();
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("secret recipient");
  expect(m.limit).toHaveBeenCalledTimes(1); expect(m.send).toHaveBeenCalledTimes(1);
 });
});
