import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/places/photo/route";

const ORIGINAL_ENV = process.env;

describe("place photo proxy fallback", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        process.env = { ...ORIGINAL_ENV };
        delete process.env.GOOGLE_PLACES_API_KEY;
        delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    });

    afterEach(() => {
        process.env = ORIGINAL_ENV;
        vi.restoreAllMocks();
    });

    it("returns a valid fallback image when Google Places is not configured", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(new Uint8Array([1, 2, 3]), {
                status: 200,
                headers: { "Content-Type": "image/jpeg" },
            })
        );
        const fallback = "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=1200&q=90";
        const request = new NextRequest(
            `https://www.localley.io/api/places/photo?name=places%2Fabc%2Fphotos%2Fdef&fallback=${encodeURIComponent(fallback)}`
        );

        const response = await GET(request);

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/jpeg");
        expect(response.headers.get("X-Localley-Photo-Fallback")).toBe("missing_google_places_api_key");
        expect(fetchMock).toHaveBeenCalledWith(fallback, expect.any(Object));
    });

    it("does not proxy arbitrary fallback hosts", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");
        const request = new NextRequest(
            "https://www.localley.io/api/places/photo?name=places%2Fabc%2Fphotos%2Fdef&fallback=https%3A%2F%2Fexample.com%2Ftracking.jpg"
        );

        const response = await GET(request);

        expect(response.status).toBe(503);
        expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
        expect(response.headers.get("X-Localley-Photo-Fallback")).toBe("missing_google_places_api_key");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
