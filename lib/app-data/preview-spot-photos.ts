import "server-only";
import type { NextRequest } from "next/server";
import type { RawSpot } from "@/lib/spots/transform";
import { previewAppDataReader } from "./preview-db";

export function isPreviewSpotPhotosCandidate(request: NextRequest): boolean {
  return request.nextUrl.hostname === "localley-next-preview.nkopp.workers.dev"
    && request.nextUrl.searchParams.get("data_candidate") === "d1"
    && process.env.AUTH_MAIL_MODE === "outbox"
    && process.env.SUPABASE_READ_ONLY === "true";
}

/** Read the exact imported source row for a published preview spot. */
export async function previewSpotPhotoSource(id: string): Promise<RawSpot | null> {
  const canonicalId = id.toLowerCase();
  const row = await previewAppDataReader().prepare(`SELECT s.payload FROM legacy_spot_source s
    JOIN spots p ON p.id = s.spotId WHERE s.spotId = ? AND p.visible = 1`)
    .bind(canonicalId).first<{ payload: string }>();
  if (!row) return null;
  const spot: unknown = JSON.parse(row.payload);
  if (!spot || typeof spot !== "object" || Array.isArray(spot) ||
      (spot as { id?: unknown }).id !== canonicalId ||
      !Array.isArray((spot as { photos?: unknown }).photos) ||
      typeof (spot as { category?: unknown }).category !== "string") {
    throw new Error("Invalid preview spot photo source");
  }
  return spot as RawSpot;
}
