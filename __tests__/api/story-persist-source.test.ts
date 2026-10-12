// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), source: vi.fn(), tier: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.source }));
vi.mock("@/lib/usage-tracking", () => ({ getUserTier: mocks.tier }));
vi.mock("@/lib/subscription", () => ({ hasFeature: () => 7 }));
import { POST } from "@/app/api/itineraries/[id]/story/persist/route";
const id = "11111111-1111-4111-8111-111111111111";
const path = `https://www.localley.io/api/itineraries/${id}/story/persist`;
const png = (size = 9) => { const bytes = new Uint8Array(size); bytes.set([137,80,78,71,13,10,26,10]); return bytes; };
let upload: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn>, single: ReturnType<typeof vi.fn>;
const request = (bytes: Uint8Array) => { const body = new FormData(); body.append("cover", new Blob([Buffer.from(bytes)], { type: "image/png" }), "cover.png"); return new NextRequest(path, { method: "POST", body }); };
const post = (req: NextRequest) => POST(req, { params: Promise.resolve({ id }) });
beforeEach(() => {
 vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: "owner" }); mocks.tier.mockResolvedValue("free");
 single = vi.fn().mockResolvedValue({ data: { clerk_user_id: "owner" }, error: null });
 update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
 const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single, update };
 upload = vi.fn().mockResolvedValue({ error: null });
 mocks.source.mockReturnValue({ from: vi.fn().mockReturnValue(query), storage: { from: vi.fn().mockReturnValue({ upload, createSignedUrl: async () => ({ data: { signedUrl: "https://storage.example/cover.png" }, error: null }) }) } });
});
describe("bounded normal story persistence", () => {
 it("persists a PNG-signature payload above the former2MiB cap with retention metadata", async () => {
  const bytes = png(3 * 1024 * 1024 + 17); const response = await post(request(bytes));
  expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ success: true, retentionDays: 7, tier: "free" });
  expect(upload).toHaveBeenCalledOnce();
  const [key, stored, options] = upload.mock.calls[0];
  expect(key).toBe(`story-slides/${id}/cover.png`); expect(options).toEqual({ contentType: "image/png", upsert: true });
  expect(stored.length).toBe(bytes.length);
  expect(createHash("sha256").update(stored).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(update).toHaveBeenCalledWith({ story_slides: expect.objectContaining({ slides: { cover: "https://storage.example/cover.png" } }) });
 });
 it.each([png(8 * 1024 * 1024 + 1), new Uint8Array([82,73,70,70,0,0,0,0,87,69,66,80]), new Uint8Array([1,2,3])])("refuses oversized, WebP or short data without storage or metadata writes", async bytes => {
  expect((await post(request(bytes))).status).toBe(400); expect(upload).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
 });
 it("refuses an oversized declared request before consuming the body", async () => {
  const req = request(png()); req.headers.set("content-length", String(64 * 1024 * 1024 + 128 * 1024 + 1));
  expect((await post(req)).status).toBe(400); expect(req.bodyUsed).toBe(false); expect(upload).not.toHaveBeenCalled();
 });
 it("refuses a streamed oversized request despite a false Content-Length", async () => {
  let count = 0; const cancel = vi.fn();
  const req = new NextRequest(path, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=x", "content-length": "1" },
   body: new ReadableStream({ pull(controller) { if(count++ < 66) controller.enqueue(new Uint8Array(1024 * 1024)); else controller.close(); }, cancel }), duplex: "half" } as RequestInit);
  expect((await post(req)).status).toBe(400); expect(cancel).toHaveBeenCalledOnce(); expect(upload).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
 });
 it("denies foreign owners before reading or uploading", async () => {
  single.mockResolvedValue({ data: { clerk_user_id: "other-owner" }, error: null }); const req = request(png());
  expect((await post(req)).status).toBe(403); expect(req.bodyUsed).toBe(false); expect(mocks.tier).not.toHaveBeenCalled(); expect(upload).not.toHaveBeenCalled();
 });
 it("denies anonymous users without opening Source", async () => {
  mocks.auth.mockResolvedValue({ userId: null }); expect((await post(request(png()))).status).toBe(401); expect(mocks.source).not.toHaveBeenCalled();
 });
});
