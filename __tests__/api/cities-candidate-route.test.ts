import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ imported: vi.fn(), supabase: vi.fn() }));
vi.mock("@/lib/app-data/preview-cities", () => ({
  isPreviewCitiesCandidate: (request: NextRequest) => request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1",
  previewImportedCities: mocks.imported,
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseClient: mocks.supabase }));
vi.mock("@/lib/geography/city-shadow", () => ({ runCityGeographyShadowComparison: vi.fn() }));
import { GET } from "@/app/api/cities/route";

afterEach(() => vi.clearAllMocks());
const request = (host: string, candidate = true) => new NextRequest(
  `https://${host}/api/cities?noCache=true&includeHidden=true${candidate ? "&data_candidate=d1" : ""}`);

describe("city candidate route", () => {
  it("serves imported cities only for the preview candidate", async () => {
    mocks.imported.mockResolvedValue([{ slug: "seoul", name: "Seoul", spotCount: 150, status: "recommended" }]);
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(200);
    expect(response.headers.get("X-Localley-Data-Source")).toBe("d1-preview");
    expect((await response.json()).cities[0].spotCount).toBe(150);
    expect(mocks.supabase).not.toHaveBeenCalled();
  });

  it("fails closed for an incomplete import", async () => {
    mocks.imported.mockRejectedValue(new Error("Imported catalog is incomplete"));
    const response = await GET(request("localley-next-preview.nkopp.workers.dev"));
    expect(response.status).toBe(503);
    expect((await response.json()).cities).toEqual([]);
  });

  it("uses the existing source on normal preview and www", async () => {
    const query = { select: vi.fn().mockReturnThis(), not: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockResolvedValue({ data: [], error: null }) };
    mocks.supabase.mockReturnValue({ from: vi.fn().mockReturnValue(query) });
    expect((await GET(request("localley-next-preview.nkopp.workers.dev", false))).status).toBe(200);
    expect((await GET(request("www.localley.io"))).status).toBe(200);
    expect(mocks.imported).not.toHaveBeenCalled();
    expect(mocks.supabase).toHaveBeenCalled();
  });
});
