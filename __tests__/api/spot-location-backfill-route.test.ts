import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(async () => ({ response: null, userId: "admin_test" })),
  createSupabaseAdmin: vi.fn(),
  revalidateTag: vi.fn(),
  findBestGooglePlaceMatch: vi.fn(),
  getGooglePlacesApiKey: vi.fn(() => "google-key"),
  buildSpotPhotoUrls: vi.fn(() => [
    "/api/places/photo?name=places/ChIJ-test/photos/photo_1&w=1200",
  ]),
  getSpotPhotoBackfillNeeds: vi.fn(() => ({
    needsPhotoBackfill: true,
    needsPlaceIdBackfill: true,
    needsPlacePhotoUpgrade: true,
    hasIdentityMismatch: false,
    shouldBackfill: true,
    placePhotoIdentity: {},
  })),
  updatePayloads: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

vi.mock("@/lib/admin-auth", () => ({
  requireAdmin: mocks.requireAdmin,
}));

vi.mock("@/lib/supabase", () => ({
  createSupabaseAdmin: mocks.createSupabaseAdmin,
}));

vi.mock("@/lib/place-images", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/place-images")>();
  return {
    ...actual,
    buildSpotPhotoUrls: mocks.buildSpotPhotoUrls,
    findBestGooglePlaceMatch: mocks.findBestGooglePlaceMatch,
    getGooglePlacesApiKey: mocks.getGooglePlacesApiKey,
    getSpotPhotoBackfillNeeds: mocks.getSpotPhotoBackfillNeeds,
  };
});

function createSupabaseMock(batchRows: Array<Record<string, unknown>> = []) {
  const readQuery = {
    select: vi.fn(() => readQuery),
    eq: vi.fn(() => readQuery),
    ilike: vi.fn(() => readQuery),
    order: vi.fn(() => readQuery),
    range: vi.fn(async () => ({
      data: batchRows,
      error: null,
    })),
    single: vi.fn(async () => ({
      data: {
        id: "spot_test",
        name: { en: "LADRIO" },
        address: { en: "Kanda Jinbocho, Tokyo" },
        photos: [],
        category: "Cafe",
        google_place_id: null,
      },
      error: null,
    })),
  };

  const updateQuery = {
    update: vi.fn((payload: Record<string, unknown>) => {
      mocks.updatePayloads.push(payload);
      return updateQuery;
    }),
    eq: vi.fn(async () => ({ error: null })),
  };

  return {
    from: vi.fn((table: string) => {
      if (table !== "spots") throw new Error(`Unexpected table ${table}`);
      return {
        select: readQuery.select,
        eq: readQuery.eq,
        single: readQuery.single,
        update: updateQuery.update,
      };
    }),
  };
}

function createRequest(body: Record<string, unknown>) {
  return new NextRequest("https://www.localley.io/api/admin/spots/backfill-location", {
    method: "POST",
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
    },
  });
}

describe("/api/admin/spots/backfill-location", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updatePayloads.length = 0;
    mocks.createSupabaseAdmin.mockReturnValue(createSupabaseMock());
    mocks.findBestGooglePlaceMatch.mockResolvedValue({
      place: {
        placeId: "ChIJ-test",
        displayName: "LADRIO",
        formattedAddress: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        location: {
          latitude: 35.695,
          longitude: 139.758,
        },
        types: ["cafe"],
        photos: [{ name: "places/ChIJ-test/photos/photo_1" }],
      },
      quality: {
        acceptable: true,
        reason: "accepted",
        nameScore: 1,
        addressScore: 0.8,
      },
      query: "LADRIO, Kanda Jinbocho, Tokyo",
    });
  });

  it("dry-runs an exact place match without updating Supabase", async () => {
    const { POST } = await import("@/app/api/admin/spots/backfill-location/route");

    const response = await POST(createRequest({ spotId: "spot_test", dryRun: true, includePhotos: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      includePhotos: true,
      result: {
        status: "would_update",
        placeId: "ChIJ-test",
        formattedAddress: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        lat: 35.695,
        lng: 139.758,
        updatedFields: ["address", "location", "google_place_id", "photos"],
      },
    });
    expect(mocks.updatePayloads).toEqual([]);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });

  it("applies address, location, place id, and photo updates after preview", async () => {
    const { POST } = await import("@/app/api/admin/spots/backfill-location/route");

    const response = await POST(createRequest({ spotId: "spot_test", dryRun: false, includePhotos: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result.status).toBe("updated");
    expect(mocks.updatePayloads).toEqual([
      {
        address: {
          en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        },
        location: "POINT(139.7580000 35.6950000)",
        google_place_id: "ChIJ-test",
        photos: [
          "/api/places/photo?name=places/ChIJ-test/photos/photo_1&w=1200",
        ],
      },
    ]);
    expect(mocks.revalidateTag).toHaveBeenCalledWith("spots", "default");
  });

  it("applies exact address and location when the matched place has no photos", async () => {
    mocks.findBestGooglePlaceMatch.mockResolvedValueOnce({
      place: {
        placeId: "ChIJ-location-only",
        displayName: "LADRIO",
        formattedAddress: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        location: {
          latitude: 35.695,
          longitude: 139.758,
        },
        types: ["cafe"],
        photos: [],
      },
      quality: {
        acceptable: true,
        reason: "accepted",
        nameScore: 1,
        addressScore: 0.8,
      },
      query: "LADRIO, Kanda Jinbocho, Tokyo",
    });
    mocks.buildSpotPhotoUrls.mockReturnValueOnce([]);
    const { POST } = await import("@/app/api/admin/spots/backfill-location/route");

    const response = await POST(createRequest({ spotId: "spot_test", dryRun: false, includePhotos: true }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.result).toMatchObject({
      status: "updated",
      photoCount: 0,
      updatedFields: ["address", "location", "google_place_id"],
    });
    expect(mocks.updatePayloads).toEqual([
      {
        address: {
          en: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
        },
        location: "POINT(139.7580000 35.6950000)",
        google_place_id: "ChIJ-location-only",
      },
    ]);
  });

  it("dry-runs a capped batch of exact place matches before updating", async () => {
    mocks.createSupabaseAdmin.mockReturnValueOnce(createSupabaseMock([
      {
        id: "spot_batch_1",
        name: { en: "LADRIO" },
        address: { en: "Kanda Jinbocho, Tokyo" },
        photos: [],
        category: "Cafe",
        location: "POINT(0 0)",
        google_place_id: null,
      },
    ]));
    const { POST } = await import("@/app/api/admin/spots/backfill-location/route");

    const response = await POST(createRequest({
      city: "Tokyo",
      limit: 1,
      maxProcessed: 5,
      dryRun: true,
      includePhotos: true,
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      dryRun: true,
      includePhotos: true,
      limit: 1,
      maxProcessed: 5,
      city: "Tokyo",
      scanned: 1,
      candidates: 1,
      processed: 1,
      wouldUpdate: 1,
      updated: 0,
      results: [
        {
          id: "spot_batch_1",
          status: "would_update",
          formattedAddress: "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
          updatedFields: ["address", "location", "google_place_id", "photos"],
        },
      ],
    });
    expect(mocks.updatePayloads).toEqual([]);
    expect(mocks.revalidateTag).not.toHaveBeenCalled();
  });
});
