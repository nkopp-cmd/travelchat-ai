import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdmin } from "@/lib/supabase";
import { rateLimit, strictPlatformLimit } from "@/lib/rate-limit";
import { inferCityFromAddress } from "@/lib/cities";
import { distanceKm } from "@/lib/geocoding";
import { getGooglePlaceIdsFromSpotPhotos, getGooglePlacesApiKey, getPlacePhotoMatchQuality } from "@/lib/place-images";
import { shouldShowPublicSpot } from "@/lib/spots/public-quality";
import { getLocalizedText, normalizeSpotPhotos } from "@/lib/spots/transform";
import { getTrustedSpotGooglePlaceId } from "@/lib/spots/detail-normalization";
import { parseSpotCoordinates } from "@/lib/spots/coordinates";
import type { PhotoGalleryResponse } from "@/lib/spots/photo-contract";
import type { RawSpot } from "@/lib/spots/transform";
import { isPreviewSpotPhotosCandidate, previewSpotPhotoSource } from "@/lib/app-data/preview-spot-photos";

export const dynamic = "force-dynamic";
const developmentLimit = rateLimit({ windowMs: 60_000, maxRequests: 40 });
const headers = { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
const detailsSchema = z.object({
    id: z.string(),
    displayName: z.object({ text: z.string().min(1) }),
    formattedAddress: z.string().min(1),
    location: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }),
    photos: z.array(z.object({
        name: z.string(),
        authorAttributions: z.array(z.object({ displayName: z.string(), uri: z.string().optional() })).optional(),
    })).optional(),
});

function unavailable(status = 200, message = "Listing photos are unavailable.") {
    return NextResponse.json({ status: "unavailable", photos: [], message } satisfies PhotoGalleryResponse, { status, headers });
}

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const candidate = isPreviewSpotPhotosCandidate(req);
    const withSource = (response: NextResponse) => {
        if (candidate) response.headers.set("X-Localley-Data-Source", "d1-preview");
        return response;
    };
    const unavailableForRequest = (status = 200, message = "Listing photos are unavailable.") =>
        withSource(unavailable(status, message));
    const { id } = await context.params;
    if (!z.uuid().safeParse(id).success) return unavailableForRequest(400);
    // Public source identity and fixed codes only: never log provider bodies,
    // photo references, request headers, account identities or exception text.
    const failureForRequest = (status: 502 | 503 | 504, reason: string, upstreamStatus?: number) => {
        console.error(`[spot-photos] ${JSON.stringify({ spotId: id, reason, status,
            ...(upstreamStatus === undefined ? {} : { upstreamStatus }) })}`);
        return unavailableForRequest(status);
    };
    let exceptionReason = "request_exception";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
        // Use one IP bucket across spot IDs; the development helper keys by pathname.
        if (process.env.NODE_ENV === "production") {
            const verdict = await strictPlatformLimit(req, 40, "venue_photos_v2");
            if (verdict === "unavailable") return failureForRequest(503, "rate_limit_unavailable");
            if (verdict === "limited") return unavailableForRequest(429, "Too many requests. Please try again later.");
        } else {
            const limited = await developmentLimit(new NextRequest(new URL("/api/spots/photos", req.url), { headers: req.headers }));
            if (limited) return unavailableForRequest(limited.status);
        }
        let spot: RawSpot | null;
        if (candidate) {
            try {
                spot = await previewSpotPhotoSource(id);
            } catch {
                return failureForRequest(503, "source_unavailable");
            }
        } else {
            const result = await createSupabaseAdmin().from("spots").select("*").eq("id", id)
                .abortSignal(controller.signal).maybeSingle();
            if (result.error) return failureForRequest(503, "source_unavailable");
            spot = result.data as RawSpot | null;
        }
        if (!spot || !shouldShowPublicSpot({
            name: spot.name, address: spot.address, location: spot.location,
            photos: spot.photos, google_place_id: spot.google_place_id,
        })) return unavailableForRequest(404);
        const photos = normalizeSpotPhotos(spot.photos, spot.category, 1600);
        const placeId = getTrustedSpotGooglePlaceId({ photos, storedGooglePlaceId: spot.google_place_id });
        if (!placeId || !/^[A-Za-z0-9_-]{1,256}$/.test(placeId)) return unavailableForRequest();
        if (getGooglePlaceIdsFromSpotPhotos(photos).some(photoPlaceId => photoPlaceId !== placeId)) return unavailableForRequest();
        const apiKey = getGooglePlacesApiKey();
        if (!apiKey) return failureForRequest(503, "provider_key_missing");
        const response = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
            cache: "no-store", redirect: "manual", signal: controller.signal,
            headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "id,displayName,formattedAddress,location,photos" },
        });
        if (!response.ok) { await response.body?.cancel(); return failureForRequest(502, "provider_http", response.status); }
        const limit = 256 * 1024;
        if (Number(response.headers.get("content-length")) > limit) {
            await response.body?.cancel();
            return failureForRequest(502, "provider_payload_oversize");
        }
        const reader = response.body?.getReader();
        if (!reader) return failureForRequest(502, "provider_payload_missing");
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                size += value.length;
                if (size > limit) { exceptionReason = "provider_payload_oversize"; throw new Error("Response too large"); }
                chunks.push(value);
            }
        } finally {
            await reader.cancel();
            reader.releaseLock();
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
        exceptionReason = "provider_payload_invalid";
        const parsed = detailsSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
        exceptionReason = "request_exception";
        if (!parsed.success) return failureForRequest(502, "provider_payload_invalid");
        const place = parsed.data;
        if (place.id !== placeId) return failureForRequest(502, "listing_id_conflict");
        const address = getLocalizedText(spot.address);
        const city = inferCityFromAddress(address);
        const returnedCity = inferCityFromAddress(place.formattedAddress);
        if (!city || !returnedCity || city.slug !== returnedCity.slug || city.countryCode !== returnedCity.countryCode ||
            distanceKm(city.center.lat, city.center.lng, place.location.latitude, place.location.longitude) > 100) return failureForRequest(502, "listing_city_conflict");
        const coordinates = parseSpotCoordinates(spot.location);
        // Coordinates corroborate listing identity, not an entrance or photo verification.
        // Do not reject a Korean display name merely because the saved name is English.
        if (coordinates && (coordinates.lat !== 0 || coordinates.lng !== 0)) {
            if (distanceKm(coordinates.lat, coordinates.lng, place.location.latitude, place.location.longitude) > 1) return failureForRequest(502, "listing_coordinate_conflict");
        } else if (!getPlacePhotoMatchQuality(getLocalizedText(spot.name), address, spot.category, {
            displayName: place.displayName.text, formattedAddress: place.formattedAddress, types: [],
        }).acceptable) return failureForRequest(502, "listing_name_conflict");

        const gallery: PhotoGalleryResponse["photos"] = [];
        const names = new Set<string>();
        for (const photo of place.photos || []) {
            if (!/^places\/[A-Za-z0-9_-]{1,256}\/photos\/[A-Za-z0-9_-]{1,4096}$/.test(photo.name) ||
                !photo.name.startsWith(`places/${placeId}/photos/`) || names.has(photo.name)) continue;
            names.add(photo.name);
            const attributions = (photo.authorAttributions || []).filter(author => author.displayName.trim()).map(author => {
                let uri: string | undefined;
                try {
                    const url = new URL(author.uri?.startsWith("//") ? `https:${author.uri}` : author.uri || "");
                    if (url.protocol === "https:" && !url.username && !url.password) uri = url.toString();
                } catch { /* Keep the author's name when their link is unsafe or absent. */ }
                return { displayName: author.displayName, ...(uri ? { uri } : {}) };
            });
            const params = new URLSearchParams({ name: photo.name, w: "1600", v: "venue-photos-2" });
            gallery.push({ id: photo.name, url: `/api/places/photo?${params}`, sourceLabel: "Google listing photo", attributions });
            if (gallery.length === 4) break;
        }
        return gallery.length
            ? withSource(NextResponse.json({ status: "available", photos: gallery } satisfies PhotoGalleryResponse, { headers }))
            : unavailableForRequest();
    } catch {
        return failureForRequest(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? "request_timeout" : exceptionReason);
    } finally {
        clearTimeout(timeout);
    }
}
