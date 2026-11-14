// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

const spot = {
  id: "f242e187-56ee-4cc8-9736-52f4ea46aebc",
  name: { en: "Cafe Onion Anguk" },
  address: { en: "5 Gyedong-gil, Jongno-gu, Seoul, South Korea" },
  location: { type: "Point", coordinates: [126.9853, 37.5772] },
  category: "Cafe",
  localley_score: 5,
  photos: [],
  google_place_id: null,
};

vi.mock("@/lib/app-data/backend", () => ({ dataBackend: () => "d1" }));
vi.mock("@/lib/spots/d1-queries", () => ({ d1SpotSource: vi.fn(async (id: string) => (id === spot.id ? spot : null)) }));
vi.mock("@/lib/supabase", () => ({ createSupabaseAdmin: vi.fn() }));
vi.mock("@/lib/spots/public-quality", () => ({ shouldShowPublicSpot: () => true }));

const { GET } = await import("@/app/spots/[id]/og/route");
const call = (id: string) => GET(new Request(`https://www.localley.io/spots/${id}/og`), { params: Promise.resolve({ id }) });

describe("GET /spots/[id]/og", () => {
  it("renders a cacheable 1200x630 PNG for a public spot", async () => {
    const response = await call(spot.id);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("s-maxage=604800");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect([...bytes.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    const view = new DataView(bytes.buffer);
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([1200, 630]);
    if (process.env.SPOT_OG_OUT) (await import("node:fs")).writeFileSync(process.env.SPOT_OG_OUT, bytes);
  });

  it("returns 404 for an unknown spot or a malformed id", async () => {
    expect((await call("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await call("../etc")).status).toBe(404);
  });
});
