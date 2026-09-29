import "server-only";
import { previewAppDataReader } from "./preview-db";

const imageHosts = ["unsplash.com", "pexels.com", "supabase.co", "tripadvisor.com", "fal.media",
  "fal.run", "googleusercontent.com", "googleapis.com"];

function validImage(value: string): boolean {
  if (value.startsWith("/images/")) {
    try { return !decodeURIComponent(value).split("/").includes(".."); } catch { return false; }
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      && imageHosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

/** The preview writer accepts only bounded story image fields from known origins. */
export function parsePreviewStoryPatch(body: unknown): Record<string, string> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const entries = Object.entries(body);
  if (!entries.length || entries.length > 32 || entries.some(([key, value]) =>
    !/^(cover|summary|day(?:[1-9]|[12]\d|30))$/.test(key)
      || typeof value !== "string" || value.length > 2048 || !validImage(value))) return null;
  return body as Record<string, string>;
}

const storySelect = `SELECT m.aiBackgrounds AS backgrounds FROM legacy_itinerary_media m
  JOIN itineraries i ON i.id = m.itineraryId
  JOIN legacy_owners o ON o.ownerId = i.ownerId
  WHERE m.itineraryId = ? AND o.clerkUserId = ?`;

export async function previewStoryBackgrounds(id: string, userId: string): Promise<Record<string, string> | null> {
  const row = await previewAppDataReader().prepare(storySelect).bind(id, userId)
    .first<{ backgrounds: string | null }>();
  if (!row) return null;
  const parsed: unknown = row.backgrounds ? JSON.parse(row.backgrounds) : {};
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)
    || Object.values(parsed).some(value => typeof value !== "string")) throw new Error("Invalid story metadata");
  return parsed as Record<string, string>;
}

export async function updatePreviewStoryBackgrounds(
  id: string, userId: string, patch: Record<string, string>,
): Promise<Record<string, string> | null> {
  const db = previewAppDataReader();
  const result = await db.prepare(`UPDATE legacy_itinerary_media SET
    aiBackgrounds = json_patch(coalesce(aiBackgrounds, '{}'), ?)
    WHERE itineraryId = ? AND EXISTS (
      SELECT 1 FROM itineraries i JOIN legacy_owners o ON o.ownerId = i.ownerId
      WHERE i.id = legacy_itinerary_media.itineraryId AND o.clerkUserId = ?
    )`).bind(JSON.stringify(patch), id, userId).run();
  if (result.meta.changes !== 1) return null;
  return previewStoryBackgrounds(id, userId);
}
