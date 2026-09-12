import { beforeEach, describe, expect, it, vi } from "vitest";
import EditItineraryPage from "@/app/itineraries/[id]/edit/page";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), spot: vi.fn(), single: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/spots/planning", () => ({ getPlanningSpot: mocks.spot }));
vi.mock("@/components/itineraries/edit-form", () => ({ EditForm: () => null }));
const id = "aaaaaaaa-1111-4111-8111-111111111111";
beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "owner" });
    const query = { select: () => query, eq: () => query, single: mocks.single };
    mocks.admin.mockReturnValue({ from: () => query });
    mocks.single.mockResolvedValue({ data: { id: "trip", city: "Seoul", clerk_user_id: "owner" }, error: null });
    mocks.spot.mockResolvedValue({ id, name: "Cafe", city: "Seoul", address: "", description: "", category: "cafe" });
});
const page = (spotId: string = id) => EditItineraryPage({ params: Promise.resolve({ id: "trip" }), searchParams: Promise.resolve({ spotId }) });

describe("spot edit page", () => {
    it("keeps the local editor URL through sign-in", async () => {
        mocks.auth.mockResolvedValue({ userId: null });
        await expect(page()).rejects.toThrow(`/sign-in?redirect_url=${encodeURIComponent(`/itineraries/trip/edit?spotId=${id}`)}`);
        expect(mocks.admin).not.toHaveBeenCalled();
        expect(mocks.spot).not.toHaveBeenCalled();
    });
    it("checks ownership before loading the optional spot", async () => {
        mocks.single.mockResolvedValue({ data: { clerk_user_id: "other" }, error: null });
        await expect(page()).rejects.toThrow("Redirect to /itineraries");
        expect(mocks.spot).not.toHaveBeenCalled();
    });
    it("passes the canonical spot only for the matching city", async () => {
        const result = await page();
        expect(result.props.children.props.children.props.planningSpot.id).toBe(id);
        mocks.spot.mockResolvedValue({ id, city: "Tokyo" });
        const mismatch = await page();
        expect(mismatch.props.children.props.children.props.planningSpot).toBeNull();
        expect(mismatch.props.children.props.children.props.spotNotice).toContain("Tokyo");
    });
    it("shows invalid or unavailable notices without changing the itinerary", async () => {
        const result = await page("bad");
        expect(mocks.spot).not.toHaveBeenCalled();
        expect(result.props.children.props.children.props.spotNotice).toContain("unavailable");
        mocks.spot.mockRejectedValue(new Error("database error"));
        const failed = await page();
        expect(failed.props.children.props.children.props.spotNotice).toContain("could not load");
    });
});
