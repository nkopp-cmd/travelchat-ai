import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), save: vi.fn(), server: vi.fn(), geocode: vi.fn() }));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/app-data/preview-itinerary-save", () => ({ savePreviewItinerary: mocks.save }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("@/lib/geocoding", () => ({ geocodeItineraryActivities: mocks.geocode }));
import { POST } from "@/app/api/itineraries/save/route";

const environment = process.env;
const body = { title: "Seoul day", city: "Seoul", days: 1, activities: [{ day: 1, activities: [] }], localScore: 7 };
const request = (host: string, flag = "?data_candidate=d1", payload: unknown = body) => POST(new NextRequest(
  `https://${host}/api/itineraries/save${flag}`, { method: "POST", body: JSON.stringify(payload) }));

beforeEach(() => {
  process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.geocode.mockImplementation(async plans => plans);
  mocks.save.mockResolvedValue({ id: "new-id", clerk_user_id: "user_one", title: body.title,
    city: body.city, days: body.days, activities: body.activities });
  const user = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "profile-one" }, error: null }) };
  const itinerary = { insert: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "legacy-id", clerk_user_id: "user_one" }, error: null }) };
  mocks.server.mockResolvedValue({ from: vi.fn(table => table === "users" ? user : itinerary) });
});
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("itinerary save candidate route", () => {
  it("writes normalized plans only through the exact preview D1 gate", async () => {
    const response = await request("localley-next-preview.nkopp.workers.dev");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({ id: "new-id", title: body.title });
    expect(mocks.save).toHaveBeenCalledWith("user_one", expect.objectContaining({
      title: body.title, city: body.city, days: 1, localScore: 7, activities: expect.any(Array),
    }));
    expect(mocks.server).not.toHaveBeenCalled();
  });

  it("keeps normal preview and www on Supabase", async () => {
    const preview = await request("localley-next-preview.nkopp.workers.dev", "");
    const www = await request("www.localley.io");
    expect([preview.status, www.status]).toEqual([200, 200]);
    expect(preview.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(www.headers.get("X-Localley-Data-Source")).toBeNull();
    expect(mocks.server).toHaveBeenCalledTimes(2);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("rejects signed-out and invalid bodies before either database", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    expect((await request("localley-next-preview.nkopp.workers.dev")).status).toBe(401);
    expect((await request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1", {
      ...body, activities: [],
    })).status).toBe(400);
    expect((await request("localley-next-preview.nkopp.workers.dev", "?data_candidate=d1", {
      ...body, activities: [null],
    })).status).toBe(400);
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("returns bounded candidate errors without a Supabase fallback", async () => {
    mocks.save.mockRejectedValueOnce(new RangeError("oversized"))
      .mockRejectedValueOnce(new Error("private SQL"));
    const host = "localley-next-preview.nkopp.workers.dev";
    expect((await request(host)).status).toBe(400);
    const failure = await request(host);
    expect(failure.status).toBe(500);
    expect(failure.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect(await failure.text()).not.toContain("private SQL");
    expect(mocks.server).not.toHaveBeenCalled();
  });
});
