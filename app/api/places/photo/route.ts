import { NextRequest, NextResponse } from "next/server";
import {
    getGooglePlacesApiKey,
    normalizePhotoWidth,
} from "@/lib/place-images";

interface GooglePlacePhotoLookup {
    photos?: Array<{ name?: string }>;
}

const FALLBACK_IMAGE_HOSTS = new Set([
    "images.unsplash.com",
    "images.pexels.com",
    "media-cdn.tripadvisor.com",
]);

function photoFetchFailureResponse(reason: string, status = 502) {
    return new NextResponse("Place photo unavailable", {
        status,
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=60, s-maxage=60",
            "X-Localley-Photo-Fallback": reason,
        },
    });
}

function getSafeFallbackImageUrl(value: string | null, origin: string): string | null {
    if (!value) return null;

    try {
        const url = new URL(value, origin);
        if (url.origin === origin && url.pathname.startsWith("/images/")) {
            return url.toString();
        }

        if (url.protocol === "https:" && FALLBACK_IMAGE_HOSTS.has(url.hostname.toLowerCase())) {
            return url.toString();
        }
    } catch {
        return null;
    }

    return null;
}

function getPlaceIdFromPhotoName(photoName: string): string | null {
    const match = photoName.match(/^places\/([^/]+)\/photos\/[^/]+$/);
    return match?.[1] || null;
}

async function findReplacementPhotoName(
    photoName: string,
    apiKey: string
): Promise<string | null> {
    const placeId = getPlaceIdFromPhotoName(photoName);
    if (!placeId) return null;

    const placeUrl = new URL(`https://places.googleapis.com/v1/places/${placeId}`);
    placeUrl.searchParams.set("key", apiKey);

    const response = await fetch(placeUrl.toString(), {
        headers: {
            "X-Goog-FieldMask": "photos",
        },
        next: { revalidate: 60 * 60 * 24 },
    });

    if (!response.ok) return null;

    const data = (await response.json()) as GooglePlacePhotoLookup;
    return (
        data.photos
            ?.map((photo) => photo.name)
            .find((name): name is string => Boolean(name && name !== photoName)) || null
    );
}

async function proxiedImageResponse(
    imageUrl: string,
    fallbackReason: string,
    extraHeaders: Record<string, string> = {}
) {
    const response = await fetch(imageUrl, {
        next: { revalidate: 60 * 60 * 24 * 30 },
    });

    if (!response.ok) {
        return photoFetchFailureResponse(`${fallbackReason}_${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) {
        return photoFetchFailureResponse(`${fallbackReason}_non_image`);
    }

    const image = new Uint8Array(await response.arrayBuffer());

    return new NextResponse(image, {
        status: 200,
        headers: {
            "Content-Type": contentType,
            "Cache-Control":
                "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400",
            ...extraHeaders,
        },
    });
}

async function placePhotoUnavailable(
    reason: string,
    fallbackImageUrl: string | null,
    status = 502
) {
    if (fallbackImageUrl) {
        const response = await proxiedImageResponse(fallbackImageUrl, `fallback_image_fetch_failed_${reason}`, {
            "X-Localley-Photo-Fallback": reason,
        });

        if (response.ok) return response;
    }

    return photoFetchFailureResponse(reason, status);
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const photoName = searchParams.get("name");
    const legacyPhotoRef = searchParams.get("ref");
    const width = normalizePhotoWidth(searchParams.get("w"));
    const apiKey = getGooglePlacesApiKey();
    const fallbackImageUrl = getSafeFallbackImageUrl(searchParams.get("fallback"), req.nextUrl.origin);

    if (!photoName && !legacyPhotoRef) {
        return NextResponse.json({ error: "Missing photo reference" }, { status: 400 });
    }

    if (!apiKey) {
        return placePhotoUnavailable("missing_google_places_api_key", fallbackImageUrl, 503);
    }

    if (photoName && !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
        return placePhotoUnavailable("invalid_photo_name", fallbackImageUrl, 400);
    }

    if (legacyPhotoRef) {
        if (!/^[A-Za-z0-9_-]+$/.test(legacyPhotoRef)) {
            return placePhotoUnavailable("invalid_photo_reference", fallbackImageUrl, 400);
        }

        const legacyUrl = new URL("https://maps.googleapis.com/maps/api/place/photo");
        legacyUrl.searchParams.set("maxwidth", String(width));
        legacyUrl.searchParams.set("photo_reference", legacyPhotoRef);
        legacyUrl.searchParams.set("key", apiKey);

        const legacyResponse = await fetch(legacyUrl.toString(), {
            redirect: "manual",
            next: { revalidate: 60 * 60 * 24 * 30 },
        });
        const location = legacyResponse.headers.get("location");

        if (!location) {
            return placePhotoUnavailable(`legacy_lookup_failed_${legacyResponse.status}`, fallbackImageUrl);
        }

        const imageResponse = await proxiedImageResponse(location, "legacy_image_fetch_failed");
        if (imageResponse.ok) return imageResponse;
        return placePhotoUnavailable(imageResponse.headers.get("X-Localley-Photo-Fallback") || "legacy_image_fetch_failed", fallbackImageUrl);
    }

    const photoUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
    photoUrl.searchParams.set("maxWidthPx", String(width));
    photoUrl.searchParams.set("skipHttpRedirect", "true");
    photoUrl.searchParams.set("key", apiKey);

    const response = await fetch(photoUrl.toString(), {
        next: { revalidate: 60 * 60 * 24 * 30 },
    });

    if (!response.ok) {
        if (response.status === 404 && photoName) {
            const replacementPhotoName = await findReplacementPhotoName(photoName, apiKey);
            if (replacementPhotoName) {
                const replacementUrl = new URL(`https://places.googleapis.com/v1/${replacementPhotoName}/media`);
                replacementUrl.searchParams.set("maxWidthPx", String(width));
                replacementUrl.searchParams.set("skipHttpRedirect", "true");
                replacementUrl.searchParams.set("key", apiKey);

                const replacementResponse = await fetch(replacementUrl.toString(), {
                    next: { revalidate: 60 * 60 * 24 * 30 },
                });

                if (replacementResponse.ok) {
                    const replacementData = (await replacementResponse.json()) as { photoUri?: string };
                    if (replacementData.photoUri) {
                        return proxiedImageResponse(replacementData.photoUri, "replacement_image_fetch_failed");
                    }
                }
            }
        }

        return placePhotoUnavailable(`lookup_failed_${response.status}`, fallbackImageUrl);
    }

    const data = (await response.json()) as { photoUri?: string };
    if (!data.photoUri) {
        return placePhotoUnavailable("photo_uri_missing", fallbackImageUrl);
    }

    const imageResponse = await proxiedImageResponse(data.photoUri, "image_fetch_failed");
    if (imageResponse.ok) return imageResponse;
    return placePhotoUnavailable(imageResponse.headers.get("X-Localley-Photo-Fallback") || "image_fetch_failed", fallbackImageUrl);
}
