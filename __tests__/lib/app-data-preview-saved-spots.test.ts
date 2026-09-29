// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reader: vi.fn(), owners: vi.fn(), ensure: vi.fn() }));
vi.mock("@/lib/app-data/preview-db", () => ({ previewAppDataReader: mocks.reader }));
vi.mock("@/lib/app-data/preview-conversations", () => ({
  ownerIds: mocks.owners, ensureOwnerId: mocks.ensure,
}));
import { createPreviewSavedSpot, deletePreviewSavedSpot, isPreviewSavedSpotCandidate,
  previewSavedSpot, previewSavedSpots } from "@/lib/app-data/preview-saved-spots";

const environment = process.env;
const spotId = "11111111-1111-4111-8111-111111111111";
const savedId = "22222222-2222-4222-8222-222222222222";
function database(config: { spot?: boolean; existing?: boolean; inserted?: number;
  limit?: number; count?: number; rows?: unknown[] } = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  mocks.reader.mockReturnValue({ prepare: (sql: string) => ({ bind: (...values: unknown[]) => {
    calls.push({ sql, values });
    return {
      first: async () => sql.includes("FROM spots WHERE id =") ? config.spot === false ? null : { id: spotId }
        : sql.includes("FROM owner_limits l") ? { limitCount: config.limit ?? 10, currentCount: config.count ?? 0 }
        : sql.includes("FROM saved_spots") ? config.existing ? { id: savedId } : null : null,
      all: async () => ({ results: config.rows ?? [] }),
      run: async () => ({ meta: { changes: sql.includes("INSERT OR IGNORE INTO saved_spots")
        ? config.inserted ?? 1 : 1 } }),
    };
  } }) });
  return calls;
}
beforeEach(() => { mocks.owners.mockResolvedValue({ legacy: null, fresh: "auth:user-a" });
  mocks.ensure.mockResolvedValue("auth:user-a"); });
afterEach(() => { process.env = environment; vi.clearAllMocks(); });

describe("preview saved spots", () => {
  it("selects only the exact preview candidate", () => {
    process.env = { ...environment, AUTH_MAIL_MODE: "outbox", SUPABASE_READ_ONLY: "true" };
    const request = (host: string, flag = true) => new NextRequest(
      `https://${host}/api/spots/save${flag ? "?data_candidate=d1" : ""}`);
    expect(isPreviewSavedSpotCandidate(request("localley-next-preview.nkopp.workers.dev"))).toBe(true);
    expect(isPreviewSavedSpotCandidate(request("localley-next-preview.nkopp.workers.dev", false))).toBe(false);
    expect(isPreviewSavedSpotCandidate(request("www.localley.io"))).toBe(false);
  });

  it("reads imported and fresh owners and preserves the nested response", async () => {
    mocks.owners.mockResolvedValue({ legacy: "legacy-owner", fresh: "auth:user-a" });
    const calls = database({ existing: true, rows: [{ id: savedId, spot_id: spotId,
      createdAtMs: 1_700_000_000_000, catalogId: spotId, name: '{"en":"Spot"}',
      description: '{"en":"Description"}', category: "Cafe", localley_score: 5,
      photos: '["https://example.com/photo.jpg"]' }] });
    expect(await previewSavedSpot("user-a", spotId)).toBe(true);
    const list = await previewSavedSpots("user-a");
    expect(list.spots).toEqual([{ id: savedId, spot_id: spotId,
      created_at: new Date(1_700_000_000_000).toISOString(),
      spots: { id: spotId, name: { en: "Spot" }, description: { en: "Description" },
        category: "Cafe", localley_score: 5, photos: ["https://example.com/photo.jpg"] } }]);
    expect(calls.find(call => call.sql.includes("LEFT JOIN spots"))?.values)
      .toEqual(["legacy-owner", "auth:user-a"]);
  });

  it("guards a new save with visibility, owner and limit in one insert", async () => {
    const calls = database();
    expect(await createPreviewSavedSpot("user-a", spotId)).toEqual({ kind: "saved" });
    const write = calls.find(call => call.sql.includes("INSERT OR IGNORE INTO saved_spots"));
    expect(write?.sql).toContain("visible = 1");
    expect(write?.sql).toContain("count(*) FROM saved_spots WHERE ownerId IN (?, ?)");
    expect(write?.sql).toContain("savedSpotLimit FROM owner_limits");
    expect(write?.values).toContain("auth:user-a");
    expect(calls.some(call => call.sql.includes("INSERT OR IGNORE INTO owner_limits"))).toBe(true);
  });

  it("returns missing, duplicate and limit states without an unsafe write", async () => {
    database({ spot: false });
    expect(await createPreviewSavedSpot("user-a", spotId)).toEqual({ kind: "missing" });
    vi.clearAllMocks(); mocks.owners.mockResolvedValue({ legacy: "legacy-owner", fresh: null });
    database({ existing: true });
    expect(await createPreviewSavedSpot("user-a", spotId)).toEqual({ kind: "already" });
    vi.clearAllMocks(); mocks.owners.mockResolvedValue({ legacy: "legacy-owner", fresh: null });
    mocks.ensure.mockResolvedValue("legacy-owner");
    const calls = database({ inserted: 0, count: 10, limit: 10 });
    expect(await createPreviewSavedSpot("user-a", spotId)).toEqual({ kind: "limit", current: 10, limit: 10 });
    expect(calls.some(call => call.sql.includes("INSERT OR IGNORE INTO owner_limits"))).toBe(false);
  });

  it("deletes only mapped owners and returns empty data for unmapped users", async () => {
    const calls = database();
    await deletePreviewSavedSpot("user-a", spotId);
    expect(calls.find(call => call.sql.includes("DELETE FROM saved_spots"))?.values)
      .toEqual(["", "auth:user-a", spotId]);
    mocks.owners.mockResolvedValue({ legacy: null, fresh: null });
    expect(await previewSavedSpot("user-b", spotId)).toBe(false);
    expect(await previewSavedSpots("user-b")).toEqual({ success: true, spots: [] });
  });
});
