import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanningSpot } from "@/lib/spots/planning";

const mocks = vi.hoisted(() => ({ admin: vi.fn(), visible: vi.fn(), single: vi.fn(), select: vi.fn(), eq: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: mocks.admin }));
vi.mock("@/lib/spots/public-quality", () => ({ shouldShowPublicSpot: mocks.visible }));
const id = "aaaaaaaa-1111-4111-8111-111111111111";
const row = { id, name: { en: "Cafe", local: "Cafe Seoul" }, address: { en: "12 Street" }, description: { en: "A cafe" }, category: "cafe", photos: ["real-photo"], google_place_id: "place", location: null };
beforeEach(() => {
    vi.clearAllMocks();
    const query = { select: mocks.select, eq: mocks.eq, maybeSingle: mocks.single };
    mocks.admin.mockReturnValue({ from: () => query });
    mocks.select.mockReturnValue(query);
    mocks.eq.mockReturnValue(query);
    mocks.single.mockResolvedValue({ data: row, error: null });
    mocks.visible.mockReturnValue(true);
});

describe("canonical planning spot loader", () => {
    it("selects the full canonical row and uses every localized field for city inference", async () => {
        const spot = await getPlanningSpot(id);
        expect(mocks.select).toHaveBeenCalledWith("*");
        expect(mocks.visible).toHaveBeenCalledWith(row);
        expect(spot).toEqual({ id, name: "Cafe", city: "Seoul", address: "12 Street", description: "A cafe", category: "cafe" });
    });
    it("rejects invalid UUIDs without a query", async () => {
        expect(await getPlanningSpot("not-a-uuid")).toBeNull();
        expect(mocks.admin).not.toHaveBeenCalled();
    });
    it("returns null for missing, hidden, or unknown-city rows", async () => {
        mocks.single.mockResolvedValueOnce({ data: null, error: null });
        expect(await getPlanningSpot(id)).toBeNull();
        mocks.visible.mockReturnValueOnce(false);
        expect(await getPlanningSpot(id)).toBeNull();
        mocks.single.mockResolvedValueOnce({ data: { ...row, name: "Cafe" }, error: null });
        expect(await getPlanningSpot(id)).toBeNull();
    });
    it("throws database errors instead of hiding them", async () => {
        const error = new Error("database unavailable");
        mocks.single.mockResolvedValue({ data: null, error });
        await expect(getPlanningSpot(id)).rejects.toBe(error);
    });
    it("uses parsed coordinates when present", async () => {
        mocks.single.mockResolvedValue({ data: { ...row, location: { type: "Point", coordinates: [126.98, 37.58] } }, error: null });
        expect(await getPlanningSpot(id)).toMatchObject({ latitude: 37.58, longitude: 126.98 });
    });
});
