import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { geocodeWithCascade } from "@/lib/geocoding";

describe("geocoding cascade", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY;
    delete process.env.GOOGLE_PLACES_API_KEY;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.unstubAllGlobals();
  });

  it("tries the exact place, address, and city query before simplified fallbacks", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          lat: "35.695",
          lon: "139.758",
        },
      ],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await geocodeWithCascade(
      "1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
      "Tokyo",
      "LADRIO",
    );

    expect(result).toEqual({
      lat: 35.695,
      lng: 139.758,
      provider: "nominatim",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const firstUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(firstUrl.hostname).toBe("nominatim.openstreetmap.org");
    expect(firstUrl.searchParams.get("q")).toBe(
      "LADRIO, 1-chome-3-3 Kanda Jinbocho, Chiyoda City, Tokyo 101-0051, Japan",
    );
  });
});
