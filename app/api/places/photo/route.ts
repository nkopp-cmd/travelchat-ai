import { NextRequest, NextResponse } from "next/server";
import {
    getGooglePlacesApiKey,
    normalizePhotoWidth,
} from "@/lib/place-images";

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
        return NextResponse.json(
            { error: "Google Places API key is not configured" },
            { status: 503 }
        );
    }

    if (photoName && !/^places\/[^/]+\/photos\/[^/]+$/.test(photoName)) {
        return NextResponse.json({ error: "Invalid photo name" }, { status: 400 });
    }

    if (legacyPhotoRef) {
        if (!/^[A-Za-z0-9_-]+$/.test(legacyPhotoRef)) {
            return NextResponse.json({ error: "Invalid photo reference" }, { status: 400 });
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
            return NextResponse.json(
                { error: "Place photo lookup failed" },
                { status: legacyResponse.status === 404 ? 404 : 502 }
            );
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
        return NextResponse.json(
            { error: "Place photo lookup failed" },
            { status: response.status === 404 ? 404 : 502 }
        );
    }

    const data = (await response.json()) as { photoUri?: string };
    if (!data.photoUri) {
        return NextResponse.json({ error: "Place photo unavailable" }, { status: 404 });
    }

    return NextResponse.redirect(data.photoUri, {
        status: 302,
        headers: {
            "Cache-Control":
                "public, max-age=2592000, s-maxage=2592000, stale-while-revalidate=86400",
        },
    });
}
