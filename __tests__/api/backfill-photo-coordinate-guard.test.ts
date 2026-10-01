import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ admin: vi.fn(), find: vi.fn(), update: vi.fn(), select: vi.fn() }));
vi.mock("@/lib/admin-auth", () => ({ requireAdmin: mocks.admin }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn() }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: () => ({ from: () => ({ select: mocks.select, update: mocks.update }) }) }));
vi.mock("@/lib/place-images", async () => ({ ...await vi.importActual("@/lib/place-images"), findBestGooglePlacePhotos: mocks.find, getGooglePlacesApiKey: () => "unit-key" }));
import { POST } from "@/app/api/admin/spots/backfill-photos/route";
const id="42726b65-cba8-4266-97f4-eca6a9dc7d9b";
beforeEach(() => {
 vi.clearAllMocks(); mocks.admin.mockResolvedValue({ response: null });
 mocks.select.mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [{ id, name: { en: "Daesin-dong Old Town" }, address: { en: "Daesin-dong, Seodaemun-gu, Seoul" }, location: { coordinates: [126.9456,37.5654] }, photos: [], google_place_id: null }], error: null }) });
 mocks.find.mockResolvedValue({ query:"unit", place: { placeId: "ChIJTwlXpoSifDURJOCAoUd4JoM", displayName: "Dongnimmun Arch", formattedAddress: "Seoul", location: { latitude:37.5724017,longitude:126.9595303 }, photos:[{ name:"places/ChIJTwlXpoSifDURJOCAoUd4JoM/photos/fresh" }] } });
});
describe("source photo backfill coordinate protection", () => {
 it("refuses the different landmark 1.454km away even when the name matcher accepts it", async () => {
 const r=await POST(new NextRequest("https://www.localley.io/api/admin/spots/backfill-photos",{method:"POST",body:JSON.stringify({spotIds:[id],dryRun:false})}));
 const body=await r.json(); expect(r.status).toBe(200); expect(body.results[0].reason).toBe("listing_coordinate_conflict"); expect(mocks.update).not.toHaveBeenCalled();
 expect(mocks.select).toHaveBeenCalledWith(expect.stringContaining("location"));
 });
 it("refuses photos without coordinates when the source has a usable point", async () => {
 const match=await mocks.find();match.place.location=null;mocks.find.mockResolvedValue(match);
 const r=await POST(new NextRequest("https://www.localley.io/api/admin/spots/backfill-photos",{method:"POST",body:JSON.stringify({spotIds:[id],dryRun:false})}));
 expect((await r.json()).results[0].reason).toBe("listing_coordinate_conflict");expect(mocks.update).not.toHaveBeenCalled();
 });
});
