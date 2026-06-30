import { NextRequest, NextResponse } from "next/server";
import {
    getGooglePlacesApiKey,
    normalizePhotoWidth,
} from "@/lib/place-images";

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

async function proxiedImageResponse(imageUrl: string, fallbackReason: string) {
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
        },
    });
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const photoName = searchParams.get("name");
    const legacyPhotoRef = searchParams.get("ref");
    const width = normalizePhotoWidth(searchParams.get("w"));
    const apiKey = getGooglePlacesApiKey();

    if (!photoName && !legacyPhotoRef) {
        return NextResponse.json({ error: "Missing photo reference" }, { status: 400 });
    }

    if (!apiKey) {
        return photoFetchFailureResponse("missing_google_places_api_key", 503);
    }

    if (photoName && !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
        return photoFetchFailureResponse("invalid_photo_name", 400);
    }

    if (legacyPhotoRef) {
        if (!/^[A-Za-z0-9_-]+$/.test(legacyPhotoRef)) {
            return photoFetchFailureResponse("invalid_photo_reference", 400);
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
            return photoFetchFailureResponse(`legacy_lookup_failed_${legacyResponse.status}`);
        }

        return proxiedImageResponse(location, "legacy_image_fetch_failed");
    }

    const photoUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
    photoUrl.searchParams.set("maxWidthPx", String(width));
    photoUrl.searchParams.set("skipHttpRedirect", "true");
    photoUrl.searchParams.set("key", apiKey);

    const response = await fetch(photoUrl.toString(), {
        next: { revalidate: 60 * 60 * 24 * 30 },
    });

    if (!response.ok) {
        return photoFetchFailureResponse(`lookup_failed_${response.status}`);
    }

    const data = (await response.json()) as { photoUri?: string };
    if (!data.photoUri) {
        return photoFetchFailureResponse("photo_uri_missing");
    }

    return proxiedImageResponse(data.photoUri, "image_fetch_failed");
}
