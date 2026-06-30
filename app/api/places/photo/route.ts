import { NextRequest, NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    getGooglePlacesApiKey,
    normalizePhotoWidth,
} from "@/lib/place-images";

let fallbackImagePromise: Promise<Buffer> | null = null;

function getFallbackImage() {
    fallbackImagePromise ??= readFile(
        path.join(process.cwd(), "public/images/placeholders/default.png")
    );
    return fallbackImagePromise;
}

async function fallbackImageResponse(reason: string) {
    const image = await getFallbackImage();

    return new NextResponse(new Uint8Array(image), {
        status: 200,
        headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "X-Localley-Photo-Fallback": reason,
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
        return fallbackImageResponse("missing_google_places_api_key");
    }

    if (photoName && !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
        return fallbackImageResponse("invalid_photo_name");
    }

    if (legacyPhotoRef) {
        if (!/^[A-Za-z0-9_-]+$/.test(legacyPhotoRef)) {
            return fallbackImageResponse("invalid_photo_reference");
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
            return fallbackImageResponse(`legacy_lookup_failed_${legacyResponse.status}`);
        }

        return NextResponse.redirect(location, {
            status: 302,
            headers: {
                "Cache-Control":
                    "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400",
            },
        });
    }

    const photoUrl = new URL(`https://places.googleapis.com/v1/${photoName}/media`);
    photoUrl.searchParams.set("maxWidthPx", String(width));
    photoUrl.searchParams.set("skipHttpRedirect", "true");
    photoUrl.searchParams.set("key", apiKey);

    const response = await fetch(photoUrl.toString(), {
        next: { revalidate: 60 * 60 * 24 * 30 },
    });

    if (!response.ok) {
        return fallbackImageResponse(`lookup_failed_${response.status}`);
    }

    const data = (await response.json()) as { photoUri?: string };
    if (!data.photoUri) {
        return fallbackImageResponse("photo_uri_missing");
    }

    return NextResponse.redirect(data.photoUri, {
        status: 302,
        headers: {
            "Cache-Control":
                "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400",
        },
    });
}
