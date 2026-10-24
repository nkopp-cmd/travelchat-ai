// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { D1Sqlite } from "@/__tests__/helpers/d1-sqlite";

const mocks = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("@/lib/app-data/backend", async (original) => ({
  ...(await original<typeof import("@/lib/app-data/backend")>()), appDataDb: () => mocks.db,
}));
import { d1Client } from "@/lib/app-data/d1-postgrest";
import { savedSpotsWithSpots } from "@/lib/app-data/saved-spots";

afterEach(() => vi.unstubAllEnvs());
const spot = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("savedSpotsWithSpots", () => {
  it("Supabase: one embedded query, unchanged", async () => {
    vi.stubEnv("DATA_BACKEND", "");
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), limit: vi.fn().mockReturnThis(),
      then: (r: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(r) };
    await savedSpotsWithSpots({ from: () => chain }, "u1", ["id", "name"], 12);
    expect(chain.select).toHaveBeenCalledWith("id, spot_id, created_at, spots (id, name)");
    expect(chain.limit).toHaveBeenCalledWith(12);
  });

  it("D1: own saved rows newest first with the source spot fields, null for a missing spot", async () => {
    vi.stubEnv("DATA_BACKEND", "d1");
    const db = new D1Sqlite();
    const dir = path.resolve(__dirname, "../../migrations/app-preview");
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.sqlite.exec(readFileSync(path.join(dir, f), "utf8"));
    db.sqlite.exec(`INSERT INTO owners VALUES ('u1', 'new'), ('u2', 'new');
      INSERT INTO spots (id, name, description, category, localley_score, photos, visible) VALUES ('${spot(1)}', '{"en":"Tea"}', '{"en":"d"}', 'Cafe', 5, '[]', 1);
      INSERT INTO legacy_spot_source (spotId, payload) VALUES ('${spot(1)}', '{"id":"${spot(1)}","name":{"en":"Tea"},"photos":["/api/places/photo?name=x"],"address":{"en":"Seoul"}}');
      INSERT INTO saved_spots (id, ownerId, spotId, createdAtMs, created_at) VALUES
        ('${spot(91)}', 'u1', '${spot(1)}', 1, '2026-10-01T00:00:00+00:00'),
        ('${spot(92)}', 'u1', '${spot(2)}', 2, '2026-10-02T00:00:00+00:00'),
        ('${spot(93)}', 'u2', '${spot(1)}', 3, '2026-10-03T00:00:00+00:00');`);
    mocks.db = db;
    const { data, error } = await savedSpotsWithSpots(d1Client(db, { role: "user", userId: "u1" }), "u1", ["id", "name", "photos", "address"]);
    expect(error).toBeNull();
    expect(data).toEqual([
      { id: spot(92), spot_id: spot(2), created_at: "2026-10-02T00:00:00+00:00", spots: null },
      { id: spot(91), spot_id: spot(1), created_at: "2026-10-01T00:00:00+00:00",
        spots: { id: spot(1), name: { en: "Tea" }, photos: ["/api/places/photo?name=x"], address: { en: "Seoul" } } },
    ]);
  });
});
