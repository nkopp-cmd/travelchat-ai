// Push DJ1: the www save route is the step right after Stripe checkout (preview -> 402 -> checkout -> paid return -> save).
// Invariants: only pro/premium save; a free save writes nothing and keeps the draft; a paid return with the same draftId
// returns the stored row (no second insert); a successful save drops the server draft and clears its cookie.
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), tier: vi.fn(), server: vi.fn(), geocode: vi.fn(), drop: vi.fn(), previewSave: vi.fn(),
}));
vi.mock("@/lib/auth/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/usage-tracking", () => ({ getFreshUserTier: mocks.tier }));
vi.mock("@/lib/supabase-server", () => ({ createSupabaseServerClient: mocks.server }));
vi.mock("@/lib/geocoding", () => ({ geocodeItineraryActivities: mocks.geocode }));
vi.mock("@/lib/app-data/preview-itinerary-save", () => ({ savePreviewItinerary: mocks.previewSave }));
vi.mock("@/lib/trips/preview-draft-store", async (load) => ({
  ...(await load<typeof import("@/lib/trips/preview-draft-store")>()), dropServerDraft: mocks.drop,
}));
import { POST } from "@/app/api/itineraries/save/route";
import { DRAFT_COOKIE } from "@/lib/trips/preview-draft-store";

const DRAFT = "7d3f8a52-1c4b-4e7a-9b2d-5f6e8a9c0b1d";
const body = { draftId: DRAFT, title: "Seoul day", city: "Seoul", days: 1, activities: [{ day: 1, activities: [] }], localScore: 7 };
const save = (payload: unknown = body, cookie = `${DRAFT_COOKIE}=${DRAFT}`) => POST(new NextRequest(
  "https://www.localley.io/api/itineraries/save", { method: "POST", body: JSON.stringify(payload), headers: { cookie } }));

let previous: { data: unknown; error: unknown };
let db: { users: Record<string, ReturnType<typeof vi.fn>>; itineraries: Record<string, ReturnType<typeof vi.fn>>; from: ReturnType<typeof vi.fn> };

beforeEach(() => {
  mocks.auth.mockResolvedValue({ userId: "user_one" });
  mocks.tier.mockResolvedValue("pro");
  mocks.geocode.mockImplementation(async (plans) => plans);
  mocks.drop.mockResolvedValue(undefined);
  previous = { data: null, error: null };
  const users = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: "profile-one" }, error: null }) };
  const itineraries = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => previous), insert: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: DRAFT, clerk_user_id: "user_one", title: body.title }, error: null }) };
  db = { users, itineraries, from: vi.fn((table: string) => (table === "users" ? users : itineraries)) };
  mocks.server.mockResolvedValue({ from: db.from });
});
afterEach(() => { vi.clearAllMocks(); });

const clearedCookie = (response: Response) => (response.headers.get("set-cookie") ?? "").includes(`${DRAFT_COOKIE}=;`);

describe("www itinerary save after checkout (Push DJ1)", () => {
  it("refuses a signed-out save before the tier read or any database", async () => {
    mocks.auth.mockResolvedValueOnce({ userId: null });
    const response = await save();
    expect(response.status).toBe(401);
    expect(mocks.tier).not.toHaveBeenCalled();
    expect(mocks.server).not.toHaveBeenCalled();
    expect(mocks.drop).not.toHaveBeenCalled();
  });

  it("answers 402 for every non-paid tier, writes nothing and keeps the draft", async () => {
    const notPaid = fc.oneof(fc.constantFrom("free", "", "PRO", "Premium", "trial", "enterprise"),
      fc.string().filter((tier) => tier !== "pro" && tier !== "premium"));
    await fc.assert(fc.asyncProperty(notPaid, async (tier) => {
      vi.clearAllMocks();
      mocks.tier.mockResolvedValue(tier);
      const response = await save();
      expect(response.status).toBe(402);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect((await response.json()).error.code).toBe("payment_required");
      expect(mocks.server).not.toHaveBeenCalled();
      expect(mocks.drop).not.toHaveBeenCalled();
      expect(clearedCookie(response)).toBe(false);
    }), { numRuns: 60 });
  });

  it.each(["pro", "premium"])("saves for %s with the draft id as row id, then drops the server draft", async (tier) => {
    mocks.tier.mockResolvedValue(tier);
    const response = await save();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: DRAFT });
    expect(db.itineraries.insert).toHaveBeenCalledTimes(1);
    expect(db.itineraries.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: DRAFT, user_id: "profile-one", clerk_user_id: "user_one", title: body.title, city: "Seoul", days: 1, local_score: 7,
    }));
    expect(mocks.drop).toHaveBeenCalledWith(DRAFT);
    expect(clearedCookie(response)).toBe(true);
  });

  it("returns the stored row on a repeated paid return and never inserts a second trip", async () => {
    previous = { data: { id: DRAFT, clerk_user_id: "user_one", title: "Saved before" }, error: null };
    const response = await save();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: DRAFT, title: "Saved before" });
    expect(db.itineraries.insert).not.toHaveBeenCalled();
    // The lookup is bound to this user's id, so another user's row with the same id is never returned.
    expect(db.itineraries.eq).toHaveBeenCalledWith("id", DRAFT);
    expect(db.itineraries.eq).toHaveBeenCalledWith("clerk_user_id", "user_one");
  });

  it("reports a failed lookup as a database error without inserting or dropping the draft", async () => {
    previous = { data: null, error: { message: "private SQL" } };
    const response = await save();
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("private SQL");
    expect(db.itineraries.insert).not.toHaveBeenCalled();
    expect(mocks.drop).not.toHaveBeenCalled();
  });

  it("keeps the draft when the insert fails", async () => {
    db.itineraries.single.mockResolvedValueOnce({ data: null, error: { message: "insert failed" } });
    const response = await save();
    expect(response.status).toBe(500);
    expect(mocks.drop).not.toHaveBeenCalled();
    expect(clearedCookie(response)).toBe(false);
  });
});
