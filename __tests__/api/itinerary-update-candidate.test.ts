import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn(), server: vi.fn(), actor: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth, currentUser: vi.fn() }));
vi.mock("@/lib/app-data/preview-itinerary-update", () => ({ updatePreviewItinerary: mocks.update }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("@/lib/app-data/preview-itinerary-editor", async () => ({
  ...await vi.importActual("@/lib/app-data/preview-itinerary-editor"), assertPreviewEditorOwner: mocks.actor,
}));
import { PATCH } from "@/app/api/itineraries/[id]/update/route";

const id = "550e8400-e29b-41d4-a716-446655440000";
const body = { title: "Updated Seoul", city: "Seoul", days: [{ day: 1, activities: [] }],
  highlights: ["market"], estimated_cost: "$50" };
const environment = process.env;
const request = (host: string, flag = "?data_candidate=d1", payload: unknown = body) => PATCH(new NextRequest(
  `https://${host}/api/itineraries/${id}/update${flag}`, { method: "PATCH", body: JSON.stringify(payload) }),
  { params: Promise.resolve({ id }) });

beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.actor.mockResolvedValue("auth:user_one");
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.update.mockResolvedValue({ state: "found", itinerary: { id, title: body.title, clerk_user_id: "user_one" } });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id, clerk_user_id: "user_one", title: body.title }, error: null }) };
  mocks.server.mockResolvedValue({ from: vi.fn().mockReturnValue(query) });
});
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("itinerary update candidate route", () => {
  it("writes the normalized payload only to preview D1", async () => {
    const response = await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ success: true, itinerary: { title: body.title } });
    expect(mocks.update).toHaveBeenCalledWith(id, "user_one", expect.objectContaining({
      title: body.title, highlights: ["market"], estimatedCost: "$50",
      activities: expect.any(Array),
    }));
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("keeps missing, foreign, invalid and failed writes isolated", async () => {
    const host = "localley-next-preview.nkopp.workers.dev";
    mocks.update.mockResolvedValueOnce({ state: "missing" }).mockResolvedValueOnce({ state: "forbidden" })
      .mockRejectedValueOnce(new RangeError("Invalid itinerary update"))
      .mockRejectedValueOnce(new Error("private SQL"));
    expect((await request(host)).status).toBe(404);
    expect((await request(host)).status).toBe(403);
    expect((await request(host)).status).toBe(400);
    const failed = await request(host);
    expect(failed.status).toBe(500);
    expect(failed.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await failed.text()).not.toContain("private SQL");
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    const preview = await request("localley-next-preview.nkopp.workers.dev", "");
    const www = await request("www.localley.io");
    expect([preview.status, www.status]).toEqual([200, 200]);
    expect(preview.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(www.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.server).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects signed-out and malformed payloads before either database", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(401);
    expect((await request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1", { ...body, days: "bad" })).status).toBe(400);
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});


describe("editor candidate admission", () => {
  it("refuses explicit preview intent when safety controls are absent", async () => {
    delete process.env.SUPABASE_READ_ONLY;
    const response=await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(503);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.server).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses a different asynchronous actor before candidate reads or writes", async () => {
    const response=await PATCH(new NextRequest(`https://localley-next-preview.nkopp.workers.dev/api/itineraries/${id}/update?data_candidate=d1`,{method:"PATCH",headers:{"X-Localley-Preview-Actor":"other"},body:JSON.stringify(body)}),{params:Promise.resolve({id})});
    expect(response.status).toBe(403);expect(mocks.actor).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();expect(mocks.server).not.toHaveBeenCalled();
  });
  it("refuses unverified or legacy admission without falling back", async () => {
    const {PreviewEditorDeniedError}=await import("@/lib/app-data/preview-itinerary-editor");
    mocks.actor.mockRejectedValueOnce(new PreviewEditorDeniedError());
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();expect(mocks.server).not.toHaveBeenCalled();
  });
  it("bounds actual UTF8 bytes and rejects malformed UTF8 and extra ownership fields", async () => {
    for(const value of [new Uint8Array(300001).fill(32),new Uint8Array([0xc3,0x28]),JSON.stringify({...body,ownerId:"other"}),JSON.stringify({...body,insights:{invalid:true}}),JSON.stringify({...body,days:[{day:1,activities:[{name:"Stop",cost:{bad:1}}]}]})]){
      const response=await PATCH(new NextRequest(`https://localley-next-preview.nkopp.workers.dev/api/itineraries/${id}/update?data_candidate=d1`,{method:"PATCH",body:value}),{params:Promise.resolve({id})});
      expect(response.status).toBe(400);expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    }expect(mocks.update).not.toHaveBeenCalled();expect(mocks.server).not.toHaveBeenCalled();
  });
});
